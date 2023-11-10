import 'zone.js/dist/zone';
import { Component, Injectable } from '@angular/core';
import { CommonModule } from '@angular/common';
import { bootstrapApplication } from '@angular/platform-browser';

import { Observable, Subject, Subscription, merge, interval } from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  map,
  mergeMap,
  scan,
  shareReplay,
  startWith,
  switchMap,
  tap,
  withLatestFrom,
  take,
} from 'rxjs/operators';

export interface FileOperation {
  fileId: string;
  type: FileOperationType;
  size: number;
  operation$: Observable<any>;
}

type FileOperationType = 'download' | 'upload';
type FileOperationEvent = {
  type: 'start' | 'complete';
  operation: FileOperation;
};

const MAX_CONCURRENT_OPERATIONS = 5;
const MAX_LARGE_FILE_OPERATIONS = 2;
const LARGE_FILE_SIZE = 25 * 1024 * 1024;

@Injectable({
  providedIn: 'root',
})
export class FileOperationService {
  constructor() {}

  private operationSub$ = new Subject<FileOperation>();
  private operation$ = this.operationSub$.asObservable().pipe(shareReplay(1));
  private operationEventSub$ = new Subject<FileOperationEvent>();
  private operationSubscription?: Subscription;

  // External access to operation events for other components and services
  readonly operationEvent$ = this.operationEventSub$
    .asObservable()
    .pipe(shareReplay(1));

  addFileOperation(operation: FileOperation): void {
    this.operationSub$.next(operation);
    if (!this.operationSubscription) {
      this.initSubscription(this.operation$.pipe(startWith(operation)));
    }
  }

  private initSubscription(operation$: Observable<FileOperation>) {
    const uploadOperation$ = this.filterOperationByType$(operation$, 'upload');
    const uploadOperationEvent$ = this.filterOperationEventByType$(
      this.operationEvent$,
      'upload'
    );
    const downloadOperation$ = this.filterOperationByType$(
      operation$,
      'download'
    );
    const downloadOperationEvent$ = this.filterOperationEventByType$(
      this.operationEvent$,
      'download'
    );
    this.operationSubscription = merge(
      this.bufferOperations(uploadOperation$, uploadOperationEvent$),
      this.bufferOperations(downloadOperation$, downloadOperationEvent$)
    ).subscribe();
  }

  private filterOperationByType$(
    operation$: Observable<FileOperation>,
    type: FileOperationType
  ): Observable<FileOperation> {
    return operation$.pipe(filter((op) => op.type === type));
  }

  private filterOperationEventByType$(
    event$: Observable<FileOperationEvent>,
    type: FileOperationType
  ): Observable<FileOperationEvent> {
    return event$.pipe(filter((event) => event.operation.type === type));
  }

  private checkSize(op: FileOperation, isLarge?: boolean) {
    return isLarge ? op.size > LARGE_FILE_SIZE : op.size <= LARGE_FILE_SIZE;
  }

  private bufferOperations(
    operation$: Observable<FileOperation>,
    operationEvent$: Observable<FileOperationEvent>
  ) {
    const operationsQueue$ = this.getOperationsQueue$(
      operation$,
      operationEvent$
    );
    const activeOperationsQueue$ = this.getActiveOperations$(operationEvent$);
    const operationCompleted$ = operationEvent$.pipe(
      filter((event) => event.type === 'complete')
    );
    const nextNormalOperation$ = this.getNextOperation$(
      operationCompleted$,
      operationsQueue$
    );
    const nextLargeOperation$ = this.getNextOperation$(
      operationCompleted$,
      operationsQueue$,
      true
    );
    const normalOperationHandler$ = this.getOperationHandler$(
      nextNormalOperation$,
      activeOperationsQueue$
    );
    const largeOperationHandler$ = this.getOperationHandler$(
      nextLargeOperation$,
      activeOperationsQueue$,
      true
    );
    return merge(normalOperationHandler$, largeOperationHandler$);
  }

  private getOperationHandler$(
    nextOperation$: Observable<FileOperation>,
    activeOperationsQueue$: Observable<FileOperation[]>,
    isLarge?: boolean
  ) {
    const maxOperations = isLarge
      ? MAX_LARGE_FILE_OPERATIONS
      : MAX_CONCURRENT_OPERATIONS;
    // Active count includes all items if isLarge is false. 5 for all, 2 for large files.
    const activeOpCount$ = activeOperationsQueue$.pipe(
      map(
        (ops) =>
          ops.filter((op) => (isLarge ? this.checkSize(op, true) : true)).length
      )
    );
    return nextOperation$.pipe(
      withLatestFrom(activeOpCount$),
      filter(([_, activeOpCount]) => activeOpCount < maxOperations),
      tap(([operation]) =>
        this.operationEventSub$.next({ type: 'start', operation })
      ),
      mergeMap(([operation]) =>
        operation.operation$.pipe(
          tap(() =>
            this.operationEventSub$.next({ type: 'complete', operation })
          )
        )
      )
    );
  }

  private getNextOperation$(
    operationCompleted$: Observable<FileOperationEvent>,
    operationsQueue$: Observable<FileOperation[]>,
    isLarge?: boolean
  ) {
    // Trigger new queue listener if an operation is completed to reset distinct change check.
    return operationCompleted$.pipe(
      startWith(undefined),
      switchMap(() =>
        operationsQueue$.pipe(
          // This check separates large and small files because they have separate handlers.
          map((ops) => ops.filter((op) => this.checkSize(op, isLarge))),
          filter((ops) => ops.length > 0),
          map((ops) => ops[0]),
          distinctUntilChanged()
        )
      )
    );
  }

  private getActiveOperations$(
    operationEvent$: Observable<FileOperationEvent>
  ) {
    return operationEvent$.pipe(
      scan((ops: FileOperation[], event: FileOperationEvent) => {
        if (event.type === 'start') {
          ops.push(event.operation);
        } else if (event.type === 'complete') {
          const operationIndex = ops.findIndex(
            (op) => op.fileId === event.operation.fileId
          );
          if (operationIndex > -1) {
            ops.splice(operationIndex, 1);
          }
        }
        return ops;
      }, []),
      startWith([]),
      shareReplay(1)
    );
  }

  private getOperationsQueue$(
    operation$: Observable<FileOperation>,
    operationEvent$: Observable<FileOperationEvent>
  ) {
    const activeOperationFileId$ = operationEvent$.pipe(
      filter((event) => event.type === 'start'),
      map((event) => event.operation.fileId)
    );
    return merge(operation$, activeOperationFileId$).pipe(
      scan((ops: FileOperation[], op: FileOperation | string) => {
        if (typeof op === 'string') {
          // remove active operation from operation list
          const startedOpIndex = ops.findIndex((_op) => _op.fileId === op);
          if (startedOpIndex > -1) {
            ops.splice(startedOpIndex, 1);
          }
        } else {
          ops.push(op);
        }
        return ops;
      }, []),
      shareReplay(1)
    );
  }
}

@Component({
  selector: 'my-app',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Hello from {{name}}!</h1>
    <a target="_blank" href="https://angular.io/start">
      Learn more about Angular 
    </a>
  `,
})
export class App {
  constructor(private fileOperationService: FileOperationService) {
    this.fileOperationService.operationEvent$
      .pipe(tap((event) => console.log(event)))
      .subscribe();
    this.fileOperationService.addFileOperation({
      fileId: '1',
      type: 'download',
      size: 5 * 1024 * 1024,
      operation$: interval(1000).pipe(take(1)),
    });
    this.fileOperationService.addFileOperation({
      fileId: '2',
      type: 'download',
      size: 5 * 1024 * 1024,
      operation$: interval(200).pipe(take(1)),
    });
    this.fileOperationService.addFileOperation({
      fileId: '3',
      type: 'download',
      size: 5 * 1024 * 1024,
      operation$: interval(6000).pipe(take(1)),
    });
    this.fileOperationService.addFileOperation({
      fileId: '4',
      type: 'download',
      size: 35 * 1024 * 1024,
      operation$: interval(10000).pipe(take(1)),
    });
    this.fileOperationService.addFileOperation({
      fileId: '5',
      type: 'download',
      size: 45 * 1024 * 1024,
      operation$: interval(11000).pipe(take(1)),
    });
    this.fileOperationService.addFileOperation({
      fileId: '6',
      type: 'download',
      size: 5 * 1024 * 1024,
      operation$: interval(1300).pipe(take(1)),
    });
    this.fileOperationService.addFileOperation({
      fileId: '7',
      type: 'download',
      size: 35 * 1024 * 1024,
      operation$: interval(10000).pipe(take(1)),
    });

    setTimeout(() => {
      this.fileOperationService.addFileOperation({
        fileId: '3',
        type: 'download',
        size: 5 * 1024 * 1024,
        operation$: interval(6000).pipe(take(1)),
      });
      this.fileOperationService.addFileOperation({
        fileId: '4',
        type: 'download',
        size: 35 * 1024 * 1024,
        operation$: interval(10000).pipe(take(1)),
      });
    }, 30000);
  }
  name = 'Angular';
}

bootstrapApplication(App);

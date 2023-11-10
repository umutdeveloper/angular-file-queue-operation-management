
# Angular File Queue Operation Management

An Angular service that manages the total concurrent download and upload operations to limit them to prevent bandwidth issues and provide stability in the application.

[Stackblitz ⚡️](https://stackblitz.com/edit/angular-file-queue-operation-management)

## Usage

* Inject FileOperationService and use it!

```ts
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
```

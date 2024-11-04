export type Releaser = () => void;

export class Semaphore {
  private free = 0;
  private waiting: ((value: Releaser) => void)[] = [];

  /**
   * If the semaphore is blocked, no more permits can be acquired.
   */
  private blocked = false;

  constructor(private max: number) {
    this.free = max;
  }

  /**
   * Acquire a permit from the semaphore.
   */
  acquire(): Promise<Releaser> {
    if (this.max === 0) {
      return Promise.resolve(() => {});
    }

    return new Promise((resolve) => {
      if (this.blocked) {
        this.waiting.push(resolve);
        console.debug('semaphore: blocked, waiting for release');
        return;
      }

      if (this.waiting.length > 0) {
        this.waiting.push(resolve);
        console.debug('semaphore: waiting for permit');
        return;
      }

      if (this.free > 0) {
        this.free--;
        console.debug('semaphore: acquired permit');
        resolve(() => {
          this.free++;
          console.debug(`semaphore: released permit [free=${this.free}]`);
          this.release();
        });
        return;
      }

      // We should never get here, but just in case. ¯\_(ツ)_/¯
      console.debug('semaphore: no free permits, waiting for release');
      this.waiting.push(resolve);
    });
  }

  /**
   * Releases a permit to the semaphore, and resolves any waiting promises.
   */
  private release() {
    if (this.waiting.length > 0 && !this.blocked) {
      const resolve = this.waiting.shift()!;
      this.free--;
      resolve(() => {
        this.free++;
        console.debug(`semaphore: released permit [free=${this.free}]`);
        this.release();
      });

      if (this.waiting.length > 0 && this.free > 0) {
        this.release();
      }
    }
  }

  public block(): Releaser {
    console.debug('semaphore: block');
    this.blocked = true;
    return () => {
      console.debug('semaphore: unblock');
      this.blocked = false;
      this.release();
    };
  }
}

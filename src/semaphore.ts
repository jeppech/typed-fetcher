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
  acquire(id?: string): Promise<Releaser> {
    if (this.max === 0) {
      return Promise.resolve(() => {});
    }

    return new Promise((resolve) => {
      if (this.blocked) {
        this.waiting.push(resolve);
        // console.debug(`semaphore: blocked, waiting for release. ${id}`);
        return;
      }

      if (this.waiting.length > 0) {
        this.waiting.push(resolve);
        // console.debug(`semaphore: waiting for permit. ${id}`);
        return;
      }

      if (this.free > 0) {
        this.free--;
        // console.debug(`semaphore: acquired lock. ${id}`);
        resolve(() => {
          this.free++;
          // console.debug(`semaphore: released lock. ${id} [free=${this.free}]`);
          this.release(id);
        });
        return;
      }

      // We should never get here, but just in case. ¯\_(ツ)_/¯
      // console.debug('semaphore: no free locks, waiting for release');
      this.waiting.push(resolve);
    });
  }

  /**
   * Releases a permit to the semaphore, and resolves any waiting promises.
   */
  private release(id?: string) {
    if (this.waiting.length > 0 && !this.blocked) {
      const resolve = this.waiting.shift()!;
      this.free--;
      resolve(() => {
        this.free++;
        // console.debug(`semaphore: released lock ${id} [free=${this.free}]`);
        this.release();
      });

      if (this.waiting.length > 0 && this.free > 0) {
        this.release(id);
      }
    }
  }

  public block(id?: string): Releaser {
    // console.debug(`semaphore: BLOCK. ${id}`);
    this.blocked = true;
    return () => {
      // console.debug(`semaphore: UNBLOCK. ${id}`);
      this.blocked = false;
      this.release();
    };
  }
}

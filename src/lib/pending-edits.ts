/** Track explicit edits independently of incoming records and job results. */
export class PendingEdits<T extends object> {
  private revision = 0
  private fields = new Map<keyof T, { value: T[keyof T]; revision: number }>()

  set<K extends keyof T>(key: K, value: T[K]) {
    this.fields.set(key, { value, revision: ++this.revision })
  }

  snapshot() {
    const fields = new Map(this.fields)
    const patch = Object.fromEntries(
      [...fields].map(([key, edit]) => [key, edit.value]),
    ) as Partial<T>
    return {
      patch,
      acknowledge: () => {
        for (const [key, edit] of fields) {
          if (this.fields.get(key)?.revision === edit.revision)
            this.fields.delete(key)
        }
      },
    }
  }
}

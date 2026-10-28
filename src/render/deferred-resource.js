/** Share one request and keep failures dormant until the user explicitly retries. */
export function createDeferredResource(load, schedule = task => task()) {
  let status = 'idle', value = null, error = null, pending = null;
  return {
    get status() { return status; },
    get value() { return value; },
    get error() { return error; },
    request({ retry = false } = {}) {
      if (status === 'ready') return Promise.resolve(value);
      if (pending) return pending;
      if (status === 'error' && !retry) return Promise.reject(error);
      status = 'loading'; error = null;
      pending = Promise.resolve().then(() => schedule(load)).then(result => {
        value = result; status = 'ready'; pending = null; return result;
      }, reason => {
        error = reason; status = 'error'; pending = null; throw reason;
      });
      return pending;
    },
  };
}

/** Avoid overlapping GLB decoding peaks when a visitor changes building rapidly. */
export function createSerialTaskQueue() {
  let tail = Promise.resolve();
  return task => {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  };
}

export function detailAssetKind(level) {
  if (level?.units?.some(unit => unit.residence?.prototype)) return 'residential';
  if (level?.units?.some(unit => unit.residence?.suitePlan)) return 'suite';
  return null;
}

/** A completed download must not instantiate a floor the visitor already left. */
export function activeDetailFloor(state) {
  return state.explore ? state.explore.level
    : state.focus || (state.building ? `${state.building}-1F` : null);
}

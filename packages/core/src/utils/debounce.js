/**
 * Returns a debounced version of `fn` that delays invocation until after
 * `wait` ms have elapsed since the last call. The returned function also
 * exposes a `cancel()` method to clear any pending invocation.
 */
export function debounce(fn, wait) {
  if (typeof fn !== 'function') throw new TypeError('debounce: first argument must be a function');
  let timer = null;

  function debounced(...args) {
    const ctx = this;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(ctx, args);
    }, wait);
  }

  debounced.cancel = function () {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

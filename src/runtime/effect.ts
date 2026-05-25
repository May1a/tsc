export type RuntimeEffect<A, E = never> = () => RuntimeResult<A, E>;

export type RuntimeResult<A, E> =
  | { readonly tag: "success"; readonly value: A }
  | { readonly tag: "failure"; readonly error: E };

export const succeed = <A>(value: A): RuntimeEffect<A> =>
  () => ({ tag: "success", value });

export const fail = <E>(error: E): RuntimeEffect<never, E> =>
  () => ({ tag: "failure", error });

export const flatMap = <A, E, B, E2>(
  effect: RuntimeEffect<A, E>,
  next: (value: A) => RuntimeEffect<B, E2>
): RuntimeEffect<B, E | E2> =>
  () => {
    const result = effect();
    if (result.tag === "failure") {
      return result;
    }

    return next(result.value)();
  };

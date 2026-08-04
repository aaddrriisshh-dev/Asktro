/// A lightweight `Result` type so the data/domain layers never throw raw
/// exceptions into the UI. Presentation pattern-matches on success/failure.
sealed class Result<T> {
  const Result();

  bool get isSuccess => this is Success<T>;
  bool get isFailure => this is ResultFailure<T>;

  T? get valueOrNull => switch (this) {
        Success<T>(:final value) => value,
        ResultFailure<T>() => null,
      };

  R when<R>({
    required R Function(T value) success,
    required R Function(Failure failure) failure,
  }) =>
      switch (this) {
        Success<T>(:final value) => success(value),
        ResultFailure<T>(failure: final f) => failure(f),
      };
}

class Success<T> extends Result<T> {
  const Success(this.value);
  final T value;
}

class ResultFailure<T> extends Result<T> {
  const ResultFailure(this.failure);
  final Failure failure;
}

/// Typed failures with user-friendly messages (never expose stack traces).
class Failure {
  const Failure({
    required this.message,
    this.code,
    this.cause,
  });

  final String message;
  final String? code;
  final Object? cause;

  factory Failure.network() =>
      const Failure(message: 'No internet connection. Please try again.', code: 'network');

  factory Failure.insufficientBalance() => const Failure(
        message: 'Your balance is too low to start this consultation.',
        code: 'INSUFFICIENT_BALANCE',
      );

  factory Failure.unknown([Object? cause]) =>
      Failure(message: 'Something went wrong. Please try again.', code: 'unknown', cause: cause);

  @override
  String toString() => 'Failure($code): $message';
}

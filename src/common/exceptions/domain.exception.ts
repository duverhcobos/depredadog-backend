export abstract class DomainException extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

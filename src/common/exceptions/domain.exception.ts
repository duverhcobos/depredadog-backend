export abstract class DomainException extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number = 400,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

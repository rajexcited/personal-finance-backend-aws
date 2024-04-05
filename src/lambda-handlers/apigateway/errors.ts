export interface InvalidField {
  path: string;
  message: string;
}

export class ValidationError extends Error {
  private invalidFields: InvalidField[];

  constructor(invalidFields: InvalidField[]) {
    super(JSON.stringify(invalidFields, null, 2));
    this.invalidFields = invalidFields;
  }

  public getInvalidFields(): InvalidField[] {
    // deep copy to avoid object reference issue
    return this.invalidFields.map((o) => ({ ...o }));
  }

  public addInvalidField(fieldPathLocation: string, errorMessage: string) {
    this.invalidFields = [...this.invalidFields, { path: fieldPathLocation, message: errorMessage }];
  }
}

export class UnAuthorizedError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

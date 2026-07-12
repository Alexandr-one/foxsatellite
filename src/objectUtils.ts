export function asRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === "object" && value != undefined
    ? (value as Record<string, unknown>)
    : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function prop(
  object: unknown,
  ...keys: string[]
): unknown {
  const record = asRecord(object);

  if (record == undefined) {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

export function numberProp(
  object: unknown,
  ...keys: string[]
): number | undefined {
  const value = prop(object, ...keys);

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : undefined;
  }

  return undefined;
}

export function stringProp(
  object: unknown,
  ...keys: string[]
): string | undefined {
  const value = prop(object, ...keys);

  return typeof value === "string"
    ? value
    : undefined;
}

export function mergeDefined<T extends object>(
  current: T | undefined,
  patch: Partial<T>,
): T {
  const result = {
    ...(current ?? ({} as T)),
  };

  for (const [key, value] of Object.entries(patch)) {
    if (value != undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}
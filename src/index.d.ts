export type PlanType =
  | "replacement"
  | "value"
  | "number"
  | "rawValue"
  | "instance"
  | "function"
  | "class"
  | "function*"
  | "function**"
  | "module"
  | "work"
  | "step-in"
  | "step-out";

export interface EntryOptions {
  private?: boolean;
}

export interface NumberEntryOptions extends EntryOptions {
  min?: number;
  max?: number;
  default?: number;
  nullable?: boolean;
}

export interface ClassEntryOptions extends EntryOptions {
  /** @deprecated use packages instead */
  map: <T, TReturn>(dependencies: T) => TReturn;
}

export interface PlanEntry<T = any> {
  path: string;
  type: PlanType;
  name: string;
  value: T;
  options?: EntryOptions;
}

declare class Context {}

declare class Plan {
  constructor(entries: PlanEntry[], verbose?: boolean);
  static newPlan(entries: PlanEntry[], verbose?: boolean): Plan;
  static makeWriteFilesystem(basePath: string): (entries: PlanEntry[]) => void;
  static makeDotWrite(basePath: string): (entries: PlanEntry[]) => void;

  static init(item: PlanDefinition, verbose?: boolean): void;
  /** @deprecated avoid singleton and prefer use execute instead of init/inject */
  static inject<T>(): T;
  static execute<T>(
    plan: PlanDefinition,
    context: Context,
    verbose?: boolean
  ): T;
  static applyEntry(entry: PlanEntry, context: Plan);

  replace<T>(relativePath: string, value: T, options?: EntryOptions): Plan;

  addPackage(name: string, item: PlanDefinition, options?: EntryOptions): Plan;
  addStep(name: string, item: PlanDefinition, options?: EntryOptions): Plan;
  addValue<T>(name: string, value: T, options?: EntryOptions): Plan;
  addNumber(name: string, value: number, options?: NumberEntryOptions): Plan;
  addInstance<T>(name: string, value: T, options?: EntryOptions): Plan;
  addFunction<T extends Function>(
    name: string,
    value: T,
    options?: EntryOptions
  ): Plan;
  addUsingClass<T>(
    name: string,
    value: new (...args: any[]) => T,
    options?: ClassEntryOptions
  ): Plan;
  /** @deprecated use addUsingClass instead */
  addClass<T>(Class: new (...args: any[]) => T, options?: EntryOptions): Plan;
  addUsingFunction<T>(
    name: string,
    factoryFunction: (...args: any[]) => T,
    option?: EntryOptions
  ): Plan;
  addUsingFunctionStack(
    name: string,
    factoryFunctionList: Array<(...args: any[]) => any>,
    options?: EntryOptions
  ): Plan;
  addModule<T>(name: string, module: () => T, options?: EntryOptions): Plan;
  addAllKeysFrom(object: Record<string, any>, options?: EntryOptions): Plan;
  with<T>(name: string, work: (entry: T) => void, options?: EntryOptions): Plan;
  addMetadataHook(hook): Plan;
}

export type PlanFactory = (plan: Plan) => Plan;

export type PlanDefinition = Plan | PlanFactory | Array<Plan | PlanFactory>;

/** @deprecated use "execute" function instead to avoid singleton creation. */
export function init(item: PlanDefinition, verbose?: boolean): void;
/** @deprecated prefer adding the component in the context */
export function inject<T>(): T;
export function execute<T>(
  plan: PlanDefinition,
  context?: Context,
  verbose?: boolean
): T;

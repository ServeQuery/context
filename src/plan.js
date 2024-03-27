const fs = require('fs');
const { sep, relative, join } = require('path');

const Context = require('./context');

const METADATA_HOOK = 'metadata-hook';

module.exports = class Plan {
  constructor(_entries = [], verbose = false) {
    this._entries = _entries;
    this._stepsWalk = [];
    this._verbose = verbose;
  }

  static newPlan(...args) {
    return new Plan(...args);
  }

  static makeWriteFilesystem(...basePath) {
    return (entries) => {
      entries.forEach(({ path: entryPath, name: entryName, type, requires }) => {
        if (type === 'step') {
          const folder = join(...basePath, ...entryPath.split('/'));
          fs.mkdirSync(folder, { recursive: true });
        } else {
          const filename = `${entryName}.js`;
          const filepath = join(...basePath, ...entryPath.split('/'), filename);
          const requirePaths = requires
            .map(({ path, name }) => `${join(relative(entryPath, path), name)}`)
            .map((path) => (path.startsWith('.') ? path : `.${sep}${path}`));

          const requiresList = requirePaths.map((require) => `require('${require}');`);
          const fileContent = `${requiresList.join('\n')}\n\nmodule.exports = 'hello!';\n`;

          fs.writeFileSync(filepath, fileContent);
        }
      });
    };
  }

  static makeDotWrite(...basePath) {
    return (entries) => {
      const getEntriesAsJson = () => {
        const root = [];
        const getStepContent = (pathString) => {
          if (pathString.length === 0) return root;
          let current = root;
          const pathArray = pathString.split('/');
          pathArray.forEach((stepName) => {
            current = current.find(({ name }) => name === stepName).content;
          });
          return current;
        };
        entries.forEach(({ path, name, type, requires, options }) => {
          if (type === 'step') {
            const step = { type, name, options, content: [] };
            const temp = path.split('/');
            temp.pop(); // pop because we want the parent.
            path = temp.join('/');
            getStepContent(path).push(step);
          } else {
            getStepContent(path).push({ type, name, options, requires });
          }
        });
        return root;
      };
      const json = getEntriesAsJson();

      const dot = [];

      dot.push('digraph G {');
      dot.push('  rankdir=LR;');

      let clusterCount = 0;
      const indent = (deep) => ' '.repeat(2 * deep);
      const links = [];
      const appendNode = (nodes, output, deep = 1) => {
        nodes.forEach((node) => {
          if (node.type === 'step') {
            output.push(`${indent(deep)}subgraph cluster_${clusterCount += 1} {`);
            deep += 1;
            output.push(`${indent(deep)}label = "${node.name}";`);
            appendNode(node.content, output, deep);
            deep -= 1;
            output.push(`${indent(deep)}}`);
          } else {
            output.push(`${indent(deep)}${node.name};`);
          }
          links.push(node);
        });
      };
      appendNode(json, dot);

      links.forEach((node) => {
        if (node.requires && node.requires.length) {
          node.requires.forEach((requisite) => dot.push(`${indent(1)}${node.name} -> ${requisite && requisite.name};`));
        }
      });

      dot.push('}');

      const text = dot.join('\n');
      fs.mkdirSync(join(...(basePath.slice(0, basePath.length - 1))), { recursive: true });
      fs.writeFileSync(join(...basePath), text);
    };
  }

  /**
   * This is useful in legacy code only.
   * It's to keep a context in a singleton (retrieved via inject()).
   * A context in a singleton is usefull to be used in files that are not in the context.
   * @param item
   * @param {boolean} [verbose]
   */
  static init(item, verbose) {
    Plan.execute(item, Plan._context = new Context(), verbose);
  }

  static inject() {
    if (!Plan._context) throw new Error('Context not initiated');
    return Plan._context.get();
  }

  static execute(plan, context = new Context(), verbose = false) {
    if (!plan) throw new Error('missing item');
    if (typeof plan === 'object' && !(plan instanceof Plan) && !Array.isArray(plan)) {
      context._bag = plan;
      return context.get();
    }

    Plan
      ._mergeItem(plan, Plan.newPlan(undefined, verbose))
      ._getEntries()
      .forEach((entry) => Plan.applyEntry(entry, context));

    context.seal();
    return context.get();
  }

  static _mergeItem(item, plan) {
    if (!item) throw new Error('missing item');
    const itemIsAnArray = Array.isArray(item);
    const itemIsAFunction = typeof item === 'function';
    const itemIsAPlan = item instanceof Plan;
    const itemIsInvalid = !itemIsAFunction && !itemIsAnArray && !itemIsAPlan;

    if (itemIsAnArray) {
      item.forEach((subitem) => {
        plan = Plan._mergeItem(subitem, plan);
      });
    } else if (itemIsAFunction) {
      plan = item(plan);
      if (!plan) throw new Error('a plan function should return a plan');
    } else if (itemIsAPlan) {
      plan = Plan.newPlan([...plan._getEntries(), ...plan._prefixPaths(item._getEntries())]);
    } else if (itemIsInvalid) {
      throw new Error(`Invalid plan: received '${typeof item}' instead of 'Plan', 'function' or 'Array'`);
    }

    return plan;
  }

  static applyEntry(entry, context) {
    try {
      Plan._applyEntry(entry, context);
    } catch (error) {
      error.stack = `${error.stack}\nProblem origin - ${entry.stack || 'verbose-not-activated'}`;
      throw error;
    }
  }

  static _applyEntry(entry, context) {
    const {
      path, type, name, value, options,
    } = entry;
    switch (type) {
      case 'replacement':
        context.addReplacement(path, name, value, options);
        break;
      case 'value':
        context.addValue(path, name, value, options);
        break;
      case 'number':
        context.addNumber(path, name, value, options);
        break;
      case 'rawValue':
        context.addRawValue(path, name, value, options);
        break;
      case 'instance':
        context.addInstance(path, name, value, options);
        break;
      case 'function':
        context.addFunction(path, name, value, options);
        break;
      case 'class':
        context.addUsingClass(path, name, value, options);
        break;
      case 'function*':
        context.addUsingFunction(path, name, value, options);
        break;
      case 'function**':
        context.addUsingFunctionStack(path, name, value, options);
        break;
      case 'module':
        context.addModule(path, name, value, options);
        break;
      case 'work':
        context.with(value.name, value.work, options);
        break;
      case 'step-in':
        context.openStep(path, value, options);
        break;
      case 'step-out':
        context.closeStep(path, value, options);
        break;
      case METADATA_HOOK:
        value(context.getMetadata());
        break;
      default:
        throw new Error(`invalid entry type ${type} ${path} ${name}`);
    }
  }

  _prefixPaths(entries) {
    if (this._stepsWalk.length === 0) return entries;
    const prefix = this._stepsWalk.join('/');
    return entries.map(({ path, ...rest }) => ({ path: `${prefix}${path.length > 0 ? '/' : ''}${path}`, ...rest }));
  }

  _addEntry(name, type, value, options) {
    if (process.env.NODE_ENV !== 'test' && name === 'assertPresent') throw new Error('reserved keyword "assertPresent"');
    const path = this._stepsWalk.join('/');
    const entry = { path, name, type, value };
    if (options) entry.options = options;
    if (this._verbose) entry.stack = new Error().stack;
    this._entries.push(entry);
  }

  _getPathAndName(relativePath) {
    const absoluteSteps = [...this._stepsWalk, ...relativePath.split('/')];
    const name = absoluteSteps.pop();
    const path = absoluteSteps.join('/');
    return { path, name };
  }

  _getAbsolutePath(relativePath) {
    return [...this._stepsWalk, ...relativePath.split('/')].join('/');
  }

  replace(relativePath, value, options) {
    const valueReplacedPlan = this._replaceValue(relativePath, value, options);
    if (valueReplacedPlan) return valueReplacedPlan;

    const stepReplacedPlan = this._replaceStep(relativePath, value, options);
    if (stepReplacedPlan) return stepReplacedPlan;

    throw new Error(`Invalid replace operation: relativePath not found '${relativePath}'`);
  }

  _replaceValue(relativePath, value, options) {
    const { path, name } = this._getPathAndName(relativePath);
    const replacedIndex = this._entries.findIndex(
      ({ path: entryPath, name: entryName }) => path === entryPath && name === entryName,
    );
    if (replacedIndex === -1) return null;

    const replaced = this._entries[replacedIndex];
    const replacingEntry = {
      path, name, type: 'replacement', value, options, replaced,
    };
    const newEntries = this._entries.slice();
    newEntries.splice(replacedIndex, 1, replacingEntry);
    return new Plan(newEntries);
  }

  _replaceStep(relativePath, valueObject, options) {
    const absolutePath = this._getAbsolutePath(relativePath);
    const replacedSteps = this._entries.filter(
      ({ path: entryPath }) => entryPath.startsWith(absolutePath),
    );
    if (replacedSteps.length === 0) return null;

    const replacedIndex = this._entries.indexOf(replacedSteps[0]);
    const deleteCount = replacedSteps.length;

    const replacingEntries = Object
      .entries(valueObject)
      .map(([key, value]) => ({
        path: absolutePath, name: key, type: 'replacement', value, options,
      }));
    replacingEntries[0].replaced = replacedSteps;
    const newEntries = this._entries.slice();
    newEntries.splice(replacedIndex, deleteCount, ...replacingEntries);
    return new Plan(newEntries);
  }

  addPackage(name, item, options) {
    return this.addStep(name, item, options);
  }

  addStep(name, item, options) {
    this._stepsWalk.push(name);
    this._addEntry(Symbol('step-in'), 'step-in', name, options);
    const plan = Plan._mergeItem(item, this);
    this._addEntry(Symbol('step-out'), 'step-out', name, options);
    this._stepsWalk.pop();
    return plan;
  }

  addValue(name, value, options) {
    if (value === undefined) throw new Error('missing value');
    this._addEntry(name, 'value', value, options);
    return this;
  }

  addNumber(name, value, options) {
    this._addEntry(name, 'number', value, options);
    return this;
  }

  _addRawValue(name, rawValue, options) {
    if (rawValue === undefined) throw new Error('missing raw value');
    this._addEntry(name, 'rawValue', rawValue, options);
    return this;
  }

  addInstance(name, instance, options) {
    if (instance === undefined) throw new Error('missing instance');
    this._addEntry(name, 'instance', instance, options);
    return this;
  }

  addFunction(name, func, options) {
    if (func === undefined) throw new Error('missing function');
    this._addEntry(name, 'function', func, options);
    return this;
  }

  addUsingClass(name, Class, options) {
    if (Class === undefined) throw new Error('missing Class');
    this._addEntry(name, 'class', Class, options);
    return this;
  }

  /**
   * @deprecated Use addUsingClass instead.
   */
  addClass(Class, options) {
    const name = Plan._getInstanceName(Class, options);
    this._addEntry(name, 'class', Class, options);
    return this;
  }

  /**
   * @deprecated Use addUsingClass instead addClass.
   */
  static _getInstanceName(Class, { name } = {}) {
    if (name) return name;
    const className = Class.name;
    return className.charAt(0).toLowerCase() + className.slice(1);
  }

  addUsingFunction(name, factoryFunction, options) {
    if (factoryFunction === undefined) throw new Error('missing factoryFunction');
    this._addEntry(name, 'function*', factoryFunction, options);
    return this;
  }

  addUsingFunctionStack(name, factoryFunctionList, options) {
    if (!Array.isArray(factoryFunctionList)) throw new Error('invalid parameter must be array: factoryFunctionList');
    this._addEntry(name, 'function**', factoryFunctionList, options);
    return this;
  }

  addModule(name, module, options) {
    if (module === undefined) throw new Error('missing module');
    this._addEntry(name, 'module', module, options);
    return this;
  }

  addAllKeysFrom(object, options) {
    if (object === undefined) throw new Error('missing object');
    Object
      .entries(object)
      .forEach(([name, value]) => this._addRawValue(name, value, options));
    return this;
  }

  with(name, work, options) {
    this._addEntry(Symbol('work'), 'work', { name, work }, options);
    return this;
  }

  _getEntries() {
    return this._entries;
  }

  addMetadataHook(hook) {
    this._addEntry(Symbol(METADATA_HOOK), METADATA_HOOK, hook);
    return this;
  }
};

const Metadata = require('./metadata');

module.exports = class Context {
  constructor() {
    this._bag = {};
    this._bag.assertPresent = this._makeAssertPresent(this._bag).bind(this);
    this._metadata = new Metadata();
  }

  seal() {
    this.flushPrivates('');
    this._metadata.seal();
  }

  get() { return this._bag; }

  getMetadata() {
    return this._metadata.get();
  }

  _makeAssertPresent(bag) {
    return (requisites, rest) => {
      if (rest) throw new Error('Asserting dependencies - Only one parameter should be specified.');
      const keys = Object.keys(requisites);
      const missings = keys
        .map((key) => (bag[key] === undefined ? key : null))
        .filter((key) => key);
      if (missings.length > 0) throw new Error(`Asserting dependencies on path "${this._metadata.getCurrentPath()}": Missing dependencies: "${missings}"`);
      this._metadata.setRequisites(keys);
      return true;
    };
  }

  openStep(path, name, options) {
    this._metadata.add(path, name, 'step', null, options);
  }

  closeStep(path) {
    this.flushPrivates(path);
  }

  flushPrivates(path) {
    [
      ...this._metadata.findPrivateValuesInStep(path),
      ...this._metadata.findValuesInPrivateSubSteps(path),
    ].forEach((name) => delete this._bag[name]);
  }

  _setValue(name, value) {
    this._bag[name] = value;
    return this;
  }

  _checkKeyAvailable(name) {
    if (this._bag[name]) throw new Error(`Adding value on path "${this._metadata.getCurrentPath()}": Key already exists: "${name}"`);
  }

  _setNewValue(name, value, options = {}) {
    this._checkKeyAvailable(name);
    this._setValue(name, value, options);
  }

  addReplacement(path, name, value, options) {
    try {
      this._metadata.add(path, name, 'replacement', value, options);
      this._setNewValue(name, value, options);
      return this;
    } catch (cause) {
      throw new Error(`Adding replacement on path "${this._metadata.getCurrentPath()}": ${cause.message}`, { cause });
    }
  }

  addValue(path, name, value, options) {
    try {
      this._metadata.add(path, name, 'value', value, options);
      this._setNewValue(
        name,
        (typeof value === 'function') ? value(this.get()) : value,
        options,
      );
      return this;
    } catch (cause) {
      throw new Error(`Adding value on path "${this._metadata.getCurrentPath()}": ${cause.message}`, { cause });
    }
  }

  addRawValue(path, name, value, options) {
    try {
      this._metadata.add(path, name, 'value', value, options);
      this._setNewValue(name, value, options);
      return this;
    } catch (cause) {
      throw new Error(`Adding raw value on path "${this._metadata.getCurrentPath()}": ${cause.message}`, { cause });
    }
  }

  addNumber(path, name, value, options = {}) {
    try {
      this._metadata.add(path, name, 'number', value, options);
      const {
        min = Number.NEGATIVE_INFINITY,
        default: defaultValue,
        max = Number.POSITIVE_INFINITY,
        nullable,
      } = options;
      const rawValue = (typeof value === 'function') ? value(this.get()) : value;
      if (rawValue === null) {
        if (!nullable) throw new Error('Specified value is null');
        this._setNewValue(name, rawValue, options);
        return this;
      }
      if (rawValue === undefined) {
        if (defaultValue === undefined) throw new Error('No specified value and no default value');
        this._setNewValue(name, defaultValue, options);
        return this;
      }

      const expectedNumber = Number(rawValue);
      if (Number.isNaN(expectedNumber)) {
        if (!defaultValue) throw new Error(`Specified value is not a number: "${rawValue}"`);
        this._setNewValue(name, defaultValue, options);
        return this;
      }
      if (expectedNumber < min) throw new Error(`Specified value is below min: "${expectedNumber}" (min=${min})`);
      if (max < expectedNumber) throw new Error(`Specified value is above max: "${expectedNumber}" (max=${max})`);

      this._setNewValue(name, expectedNumber, options);
      return this;
    } catch (cause) {
      throw new Error(`Adding number on path "${this._metadata.getCurrentPath()}": ${cause.message}`, { cause });
    }
  }

  addInstance(path, name, instance, options) {
    try {
      this._metadata.add(path, name, 'instance', instance, options);
      this._setNewValue(
        name,
        (typeof instance === 'function') ? instance(this.get()) : instance,
        options,
      );
      return this;
    } catch (cause) {
      throw new Error(`Adding instance on path "${this._metadata.getCurrentPath()}": ${cause.message}`, { cause });
    }
  }

  addFunction(path, name, theFunction, options) {
    try {
      this._metadata.add(path, name, 'function', theFunction, options);
      this._setNewValue(name, theFunction, options);
      return this;
    } catch (cause) {
      throw new Error(`Adding function on path "${this._metadata.getCurrentPath()}": ${cause.message}`, { cause });
    }
  }

  addUsingFunction(path, name, factoryFunction, options) {
    try {
      this._metadata.add(path, name, 'function*', factoryFunction, options);
      const bag = this.get();
      const theFunction = factoryFunction(bag);
      this._setNewValue(name, theFunction, options);
      return this;
    } catch (cause) {
      throw new Error(`Using factory function on path "${this._metadata.getCurrentPath()}": ${cause.message}`, { cause });
    }
  }

  addUsingFunctionStack(path, name, factoryFunctionList, options) {
    try {
      this._metadata.add(path, name, 'function**', factoryFunctionList, options);
      this._checkKeyAvailable(name);
      factoryFunctionList.forEach((factoryFunction) => {
        const bag = this.get();
        const value = factoryFunction(bag);
        this._setValue(name, value, options);
      });

      return this;
    } catch (cause) {
      throw new Error(`Using factory function stack on path "${this._metadata.getCurrentPath()}": ${cause.message}`, { cause });
    }
  }

  addUsingClass(path, name, Class, options) {
    try {
      this._metadata.add(path, name, 'class', Class, options);
      const instance = this._instanciate(path, name, Class, options);
      this._setNewValue(name, instance, options);
      return this;
    } catch (cause) {
      throw new Error(`Using class on path "${this._metadata.getCurrentPath()}": ${cause.message}`, { cause });
    }
  }

  addModule(path, name, module, options) {
    try {
      this._metadata.add(path, name, 'module', module, options);
      this._setNewValue(
        name,
        (typeof module === 'function') ? module() : module,
        options,
      );
      return this;
    } catch (cause) {
      throw new Error(`Using module on path "${this._metadata.getCurrentPath()}": ${cause.message}`, { cause });
    }
  }

  with(name, work) {
    try {
      work(this._lookup(name));
      return this;
    } catch (cause) {
      throw new Error(`Using with on path "${this._metadata.getCurrentPath()}": ${cause.message}`, { cause });
    }
  }

  _instanciate(path, name, FunctionFactory, { map } = {}) {
    try {
      const isClass = FunctionFactory.toString().startsWith('class');
      const ClassToInstanciate = isClass ? FunctionFactory : FunctionFactory();
      const localContext = map ? this._mapContext(map) : this.get();
      return new ClassToInstanciate(localContext);
    } catch (cause) {
      throw new Error(`Instanciating class on path "${this._metadata.getCurrentPath()}" - ${cause.message}`, { cause });
    }
  }

  static _makeMapping(bag, map) {
    const mappedBag = {};
    const unknownKeys = [];
    Object.keys(map).forEach((key) => {
      if (bag[map[key]] === undefined) unknownKeys.push(key);
      mappedBag[key] = bag[map[key]];
    });
    if (unknownKeys.length > 0) throw new Error(`mapping error, key(s) not found: ${unknownKeys.join(', ')}`);
    return mappedBag;
  }

  _mapContext(map) {
    const bag = this.get();
    if (!map) return bag;
    const mappedBag = {
      ...bag,
      ...Context._makeMapping(bag, map),
    };
    mappedBag.assertPresent = this._makeAssertPresent(mappedBag);
    return mappedBag;
  }

  _lookup(name) {
    const bag = this.get();
    if (Array.isArray(name)) {
      const dependanciesArray = name.map((key) => bag[key]);
      const dependanciesObject = {};
      name.forEach((key, i) => {
        dependanciesObject[key] = dependanciesArray[i];
      });
      return dependanciesObject;
    }
    return bag[name];
  }
};

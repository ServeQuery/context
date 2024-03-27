module.exports = class Metadata {
  constructor() {
    this._data = [];
    this._lastAdded = null;
    this.sealed = false;
  }

  seal() {
    this.sealed = true;
  }

  add(path, name, type, value, options) {
    this._data.push({ path, name, type, value, options, requires: [] });
    this._lastAdded = name;
  }

  get() {
    return this._data;
  }

  getCurrentPath() {
    const requisite = this._getRequisite(this._lastAdded);
    return `${requisite.path}/${requisite.name}`;
  }

  setRequisites(names) {
    if (this.sealed) return;// can happen when assertPresent come from inject().
    if (!this._lastAdded) throw new Error('assertPresent is called with no preceding call to add.*()');

    const lastAdded = this._lookup(this._lastAdded);
    if (!lastAdded) throw new Error(`last add ${this._lastAdded} is not in context`);

    const requisites = this._getRequisites(names);
    if (lastAdded.requires.length > 0) lastAdded.requires.push(...requisites);
    else lastAdded.requires = requisites;
  }

  _getRequisites(names) {
    return names.map((name) => this._getRequisite(name));
  }

  _getRequisite(name) {
    return this._data
      .slice()
      .reverse()
      .find(({ name: entryName }) => entryName === name);
  }

  _lookup(nameToFind) {
    return this._data.find(({ name }) => name === nameToFind);
  }

  findPrivateValuesInStep(stepPath) {
    return this._data
      .filter(({ type }) => type !== 'step')
      .filter(({ path }) => path === stepPath)
      .filter(({ options }) => options && options.private)
      .map(({ name }) => name);
  }

  findValuesInPrivateSubSteps(path) {
    const privateSubStepsPaths = this.findPrivateSubStepsPaths(path);
    return this.findNamesInStepsPaths(privateSubStepsPaths);
  }

  findPrivateSubStepsPaths(parentStepPath) {
    return this._data
      .filter(({ type }) => type === 'step')
      .filter(({ path }) => path.startsWith(`${parentStepPath}/`))
      .filter(({ options }) => options && options.private)
      .map(({ path }) => path);
  }

  findNamesInStepsPaths(stepsPaths) {
    return this._data
      .filter(({ type }) => type !== 'step')
      .filter(({ path }) => stepsPaths.includes(path))
      .map(({ name }) => name);
  }
};

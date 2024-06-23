# File System Finder
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/PaoloFernetti/fsfind/release.yml) ![GitHub package.json version](https://img.shields.io/github/package-json/v/PaoloFernetti/fsfind)
![GitHub Created At](https://img.shields.io/github/created-at/PaoloFernetti/fsfind) ![GitHub Release Date](https://img.shields.io/github/release-date/PaoloFernetti/fsfind)

Package to find file or directory by name, method returns first found result.

## Installation

```shell
npm i --save-dev @paolofernetti/fsfind
```

## Usage

CommonJS
```js
let find = require("fsfind");

let result = fsfind("SomeDirectoryOrFile");

console.log(result)  // Output path to directory or file;
```

ES Modules
```js
import find from "fsfind";

let result = fsfind("SomeDirectoryOrFile");

console.log(result)  // Output path to directory or file;
```

## Contact
| Type           | Detail                                      |
|----------------|---------------------------------------------|
| Email          | paolofernetti@yandex.ru                     |
| Github Profile | https://github.com/PaoloFernetti            |
| Repository     | https://github.com/PaoloFernetti/fsfind.git |
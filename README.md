# File System Finder

Package to find file or directory by name, method returns first found result.

## Installation

```shell
npm i --save-dev fsfind
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
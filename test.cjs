"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var jsonFilePath = "./testJson.json";
fs.readFile(jsonFilePath, "utf8", function (err, data) {
    if (err) {
        console.error("Error reading file:", err);
        return;
    }
    try {
        var jsonData = JSON.parse(data);
        console.log(jsonData);
    }
    catch (error) {
        console.error("Error parsing JSON:", error);
    }
});

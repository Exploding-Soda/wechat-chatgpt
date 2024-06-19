import * as fs from "fs";

const jsonFilePath = "./testJson.json";

fs.readFile(jsonFilePath, "utf8", (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }
  try {
    const jsonData = JSON.parse(data);
    console.log(jsonData);
  } catch (error) {
    console.error("Error parsing JSON:", error);
  }
});

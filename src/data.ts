import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ChatCompletionRequestMessageRoleEnum } from "openai";
import { User } from "./interface";
import { isTokenOverLimit } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let DefaultPrompt =
  "你是一名AI助手，尽可能解决用户问题";

interface ChatCompletionRequestMessage {
  role: ChatCompletionRequestMessageRoleEnum;
  content: string;
}

class DB {
  private static data: User[] = [];
  private static filePath = path.join(__dirname, "chatHistory.txt");

  constructor() {
    this.loadDataFromFile();
  }

  private loadDataFromFile(): void {
    try {
      console.log(
        "@data.ts,loadDataFormFile()：已执行从txt文档中读取数据并转换成JSON格式"
      );
      const fileData = fs.readFileSync(DB.filePath, "utf-8");
      const parsedData = fileData ? JSON.parse(fileData) : [];
      DB.data = parsedData;
    } catch (error) {
      console.error(
        "Failed to load data from file or JSON parsing error:",
        error
      );
      DB.data = []; // 使用空数组作为默认值
    }
  }

  public addUser(username: string): User {
    let existUser = DB.data.find((user) => user.username === username);
    if (existUser) {
      console.log(`用户${username}已存在`);
      return existUser;
    }
    const newUser: User = {
      username: username,
      chatMessage: [
        {
          role: ChatCompletionRequestMessageRoleEnum.System,
          content: DefaultPrompt,
        },
      ],
    };
    DB.data.push(newUser);
    DB.saveToFile();
    return newUser;
  }

  private static saveToFile(): void {
    const dataToSave = JSON.stringify(DB.data, null, 2);
    fs.writeFileSync(DB.filePath, dataToSave);
  }

  public getUserByUsername(username: string): User {
    return (
      DB.data.find((user) => user.username === username) ||
      this.addUser(username)
    );
  }

  public getChatMessage(username: string): ChatCompletionRequestMessage[] {
    const user = this.getUserByUsername(username);
    return user ? user.chatMessage : [];
  }

  public setPrompt(username: string, prompt: string): void {
    const user = this.getUserByUsername(username);
    if (user) {
      user.chatMessage.find(
        (msg) => msg.role === ChatCompletionRequestMessageRoleEnum.System
      )!.content = prompt;
      DB.saveToFile();
    }
  }

  public addUserMessage(username: string, message: string): void {
    const user = this.getUserByUsername(username);
    if (user) {
      while (isTokenOverLimit(user.chatMessage)) {
        user.chatMessage.splice(1, 1);
      }
      user.chatMessage.push({
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: message,
      });
      DB.saveToFile();
    }
  }

  public addAssistantMessage(username: string, message: string): void {
    const user = this.getUserByUsername(username);
    if (user) {
      while (isTokenOverLimit(user.chatMessage)) {
        user.chatMessage.splice(1, 1);
      }
      user.chatMessage.push({
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: message,
      });
      DB.saveToFile();
    }
  }

  public clearHistory(username: string): void {
    const user = this.getUserByUsername(username);
    if (user) {
      user.chatMessage = [
        {
          role: ChatCompletionRequestMessageRoleEnum.System,
          content: DefaultPrompt,
        },
      ];
      DB.saveToFile();
    }
  }

  public getAllData(): User[] {
    return DB.data;
  }
}

const DBUtils = new DB();
export default DBUtils;

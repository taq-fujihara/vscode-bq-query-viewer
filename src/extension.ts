import * as vscode from "vscode";
import { printSql } from "./commands";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "bq-query-viewer.printSql",
    async () => {
      try {
        await printSql();
      } catch (error) {
        if (error instanceof Error) {
          vscode.window.showErrorMessage(error.message);
          return;
        }
        throw error;
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

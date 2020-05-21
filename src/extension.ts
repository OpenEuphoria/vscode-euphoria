'use strict';

import * as vscode from 'vscode';

const namespaceRegex = /^\s*(namespace)\s+(\w+)$/;
const functionRegex = /^\s*(public|export|global|override)\s+(function|procedure|type)\s+(\w+)\s*\(/; // no trailing terminator ('$')
const constantRegex = /^\s*(public|export|global)\s+(constant|enum)\s+(\w+)\s+=\s+(.+)$/;
const constantStartRegex = /^\s*(public|export|global)\s+(constant|enum)(\s+(?:by)\s+(?:.+))?$/;
const constantEntryRegex = /^\s*(\w+)(?:\s+=\s+(.+))?[,]?$/;
const enumTypeStartRegex = /^\s*(public|export|global)\s+(enum\s+type)\s+(\w+)(\s+(?:by)\s+(?:.+))?$/;
const enumTypeEntryRegex = /^\s*(\w+)(?:\s+=\s+(.+))?[,]?$/;

export function activate(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            {scheme: "file", language: "euphoria"}, 
            new EuphoriaDocumentSymbolProvider()
        )
    );

}

class EuphoriaDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

    private stripComments(text: string): string {

        let commentStart = text.indexOf('--');

        if (commentStart !== -1) {
            text = text.substring(0, commentStart);
        }

        return text.trimRight();
    }

    public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> 
    {
        return new Promise((resolve, reject) =>
        {
            let symbols: vscode.DocumentSymbol[] = [];
            let stack = [symbols];

            for (var i = 0; i < document.lineCount; i++) {

                let documentLine = document.lineAt(i).text;

                //
                // strip single line comments
                //
                documentLine = this.stripComments(documentLine);

                //
                // skip blank lines and lines starting with comment
                //
                if (documentLine.length === 0) {
                    continue;
                }

                //
                // namespace declaration
                //
                if (namespaceRegex.test(documentLine)) {
                    let matches = documentLine.match(namespaceRegex) || [];

                    let namespaceSymbol = new vscode.DocumentSymbol(
                        matches[2],
                        matches[1],
                        vscode.SymbolKind.Namespace,
                        document.lineAt(i).range,
                        document.lineAt(i).range
                    );

                    stack[stack.length-1].push(namespaceSymbol);
                    stack.push(namespaceSymbol.children);

                    continue;
                }
                
                //
                // function/procedure/type declaration
                //
                if (functionRegex.test(documentLine)) {
                    let matches = documentLine.match(functionRegex) || [];

                    let functionSymbol = new vscode.DocumentSymbol(
                        matches[3],
                        matches[2],
                        vscode.SymbolKind.Function,
                        document.lineAt(i).range,
                        document.lineAt(i).range
                    );

                    stack[stack.length-1].push(functionSymbol);

                    continue;
                }

                //
                // constant/enum declaration (single line)
                //
                if (constantRegex.test(documentLine)) {
                    let matches = documentLine.match(constantRegex) || [];

                    let symbolType = matches[2];
                    let symbolKind = symbolType === "constant"
                        ? vscode.SymbolKind.Constant
                        : vscode.SymbolKind.EnumMember;
                    
                    let constantSymbol = new vscode.DocumentSymbol(
                        matches[3],
                        symbolType,
                        symbolKind,
                        document.lineAt(i).range,
                        document.lineAt(i).range
                    );

                    stack[stack.length-1].push(constantSymbol);

                    continue;
                }

                //
                // constant/enum declaration (multi-line)
                //
                if (constantStartRegex.test(documentLine)) {
                    let matches = documentLine.match(constantStartRegex) || [];

                    let symbolType = matches[2];
                    let symbolKind = symbolType === "constant"
                        ? vscode.SymbolKind.Constant
                        : vscode.SymbolKind.EnumMember;

                    let currentLine = this.stripComments(document.lineAt(++i).text);
                    while (currentLine.length === 0 && i < document.lineCount) {
                        currentLine = this.stripComments(document.lineAt(++i).text);
                    }

                    while (constantEntryRegex.test(currentLine)) {
                        let matches = currentLine.match(constantEntryRegex) || [];

                        let constantSymbol = new vscode.DocumentSymbol(
                            matches[1],
                            symbolType,
                            symbolKind,
                            document.lineAt(i).range,
                            document.lineAt(i).range
                        );

                        stack[stack.length-1].push(constantSymbol);

                        if (!currentLine.endsWith(',')) {
                            break;
                        }

                        currentLine = this.stripComments(document.lineAt(++i).text);
                        while (currentLine.length === 0 && i < document.lineCount) {
                            currentLine = this.stripComments(document.lineAt(++i).text);
                        }
                    }
                    
                    continue;
                }

                //
                // enum type declaration
                //
                if (enumTypeStartRegex.test(documentLine)) {
                    let matches = documentLine.match(enumTypeStartRegex) || [];

                    let enumTypeSymbol = new vscode.DocumentSymbol(
                        matches[3],
                        'enum type',
                        vscode.SymbolKind.Enum,
                        document.lineAt(i).range,
                        document.lineAt(i).range
                    );

                    stack[stack.length-1].push(enumTypeSymbol);
                    stack.push(enumTypeSymbol.children);

                    let currentLine = this.stripComments(document.lineAt(++i).text);
                    while (currentLine.length === 0 && i < document.lineCount) {
                        currentLine = this.stripComments(document.lineAt(++i).text);
                    }

                    while (enumTypeEntryRegex.test(currentLine)) {
                        let matches = currentLine.match(enumTypeEntryRegex) || [];

                        let constantSymbol = new vscode.DocumentSymbol(
                            matches[1],
                            'enum',
                            vscode.SymbolKind.EnumMember,
                            document.lineAt(i).range,
                            document.lineAt(i).range
                        );

                        stack[stack.length-1].push(constantSymbol);

                        if (!currentLine.endsWith(',')) {
                            break;
                        }

                        currentLine = this.stripComments(document.lineAt(++i).text);
                        while (currentLine.length === 0 && i < document.lineCount) {
                            currentLine = this.stripComments(document.lineAt(++i).text);
                        }
                    }

                    stack.pop();

                    continue;
                }
            }

            resolve(symbols);
        });
    }
}
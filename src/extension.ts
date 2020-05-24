'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as process from 'child_process';
import * as vscode from 'vscode';

//
// diagnostic provider patterns
//

const pathAndLineNoRegex = /^(.+):(\d+)$/;
const errorNumAndMsgRegex = /^<(\d+)>::\s*(.+)$/;
const errorIndicatorRegex = /^(\s+)(\^)$/;
const innerPathLineRegex = /^.+\((.+):(\d+)\).+$/;

//
// symbol provider patterns
//

const namespaceRegex = /^\s*(namespace)\s+(\w+)$/;
const functionRegex = /^\s*(public|export|global|override)\s+(function|procedure|type)\s+(\w+)\s*\(/; // no trailing terminator ('$')
const constantRegex = /^\s*(public|export|global)\s+(constant|enum)\s+(\w+)\s+=\s+(.+)$/;
const constantStartRegex = /^\s*(public|export|global)\s+(constant|enum)(\s+(?:by)\s+(?:.+))?$/;
const constantEntryRegex = /^\s*(\w+)(?:\s+=\s+(.+))?[,]?$/;
const enumTypeStartRegex = /^\s*(public|export|global)\s+(enum\s+type)\s+(\w+)(\s+(?:by)\s+(?:.+))?$/;
const enumTypeEntryRegex = /^\s*(\w+)(?:\s+=\s+(.+))?[,]?$/;

//
// global diagnostic collection for this extension
//

let diagnosticCollection: vscode.DiagnosticCollection;

//
// activate handler is called when the extension is activated
//

export function activate(context: vscode.ExtensionContext): void {

    // diagnostic collection maps document.uri to a list of diagnostics
    diagnosticCollection = vscode.languages.createDiagnosticCollection('euphoria');

    // start checking the active editor immediately
    if (vscode.window.activeTextEditor?.document.languageId === 'euphoria')  {
        updateDiagnostics(vscode.window.activeTextEditor.document);
    }

    // register to update diagnostics when an editor is activated
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => {
            // ensure this is a Euphoria document and only check on new activations
            if (editor && editor.document.languageId === 'euphoria' && !diagnosticCollection.has(editor.document.uri)) {
                updateDiagnostics(editor.document);
            }
        })
    );

    // register to update diagnostics when a document is saved
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
            if (document.languageId === 'euphoria') {
                updateDiagnostics(document);
            }
        })
    );

    // register the document symbol provider to build the outline for each document
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            {scheme: "file", language: "euphoria"}, 
            new EuphoriaDocumentSymbolProvider()
        )
    );
}

//
// updateDiagnostics is called when an editor is activated or a document is saved
//

function updateDiagnostics(document: vscode.TextDocument): void {

    // make sure that diagnostics are enabled and just exit if it's disabled
    let enableDiagnostics = vscode.workspace.getConfiguration().get('euphoria.diagnostics.enableDiagnostics');
    if (!enableDiagnostics) {
        // clear the diagnostics for this document and exit
        diagnosticCollection.set(document.uri, []);
        return;
    }

    // make sure we're in the correct working directory. if a folder
    // is opened, use that, otherwise use the document's local path.
    let workingDirectory = vscode.workspace.rootPath || path.dirname(document.uri.fsPath);

    // get the document's path relative to the current working directory. 
    let relativePathName = path.relative(workingDirectory, path.dirname(document.uri.fsPath));

    // if the paths were equal, path.relative() will return an
    // empty string, so make it a dot to represent the local path.
    if (relativePathName.length === 0) {
        relativePathName = '.';
    }

    // build the full relative path to the current document.
    let relativeFileName = relativePathName + path.sep + path.basename(document.uri.fsPath);

    // start the process in the current directory, use a shell and hide the window
    let executeOptions = { cwd: workingDirectory, shell: true, windowsHide: true };

    // spawn the process for eui in batch mode (skips 'Press enter') and test mode (do not execute)
    let eui = process.spawnSync('eui', ['-batch','-test',relativeFileName],executeOptions);

    if (eui.status === 0) {
        // the test returned 'OK' so clear the diagnostics for this document
        diagnosticCollection.set(document.uri, []);

    }
    else {

        let lineNo: number = 0;
        let errorPath: string = '';
        let errorLine: number = -1;
        let errorNum: number = -1;
        let errorMsg: string = '';
        let caratPos: number = -1;
        let diagnosticRelatedList: vscode.DiagnosticRelatedInformation[] | undefined;

        // build the path to the expected ex.err file
        let errorFile = workingDirectory + path.sep + 'ex.err';

        // read all the lines of the file into an array of strings
        let errorLines = fs.readFileSync(errorFile, 'utf-8').split(os.EOL);
        
        // check the first line for the pattern 'fullPath:lineNo'
        if (pathAndLineNoRegex.test(errorLines[lineNo] || '')) {
            let matches = errorLines[lineNo].match(pathAndLineNoRegex) || [];
            errorPath = String(matches[1]);
            errorLine = Number(matches[2]);
            lineNo++;
        }

        // check the next line for the pattern '<errorNo>:: errorMessage'
        if (errorNumAndMsgRegex.test(errorLines[lineNo] || '')) {
            let matches = errorLines[lineNo].match(errorNumAndMsgRegex) || [];
            errorNum = Number(matches[1]);
            errorMsg = String(matches[2]);
            lineNo++;

            // if the error message ends with ':' we should keep reading until we hit a blank line
            if (errorMsg.endsWith(':')) {

                // these messages will become 'related information'
                diagnosticRelatedList = [];

                // keep reading for matching lines
                while (lineNo < errorLines.length && innerPathLineRegex.test(errorLines[lineNo])) {
                    let matches = errorLines[lineNo].match(innerPathLineRegex) || [];
                    
                    let innerPath = String(matches[1]);
                    let innerLine = Number(matches[2]);

                    // make sure the path matches the file we're checking
                    if (innerPath === relativeFileName) {

                        // determine the line/character ranges for the error
                        let diagnosticRange = new vscode.Range(
                            innerLine - 1,
                            0,
                            innerLine - 1,
                            document.lineAt(innerLine).text.length
                        );

                        // build the related info object
                        let diagnosticRelated = new vscode.DiagnosticRelatedInformation(
                            new vscode.Location(document.uri, diagnosticRange),
                            errorLines[lineNo].trimLeft()
                        );

                        // push the object onto the list
                        diagnosticRelatedList.push(diagnosticRelated);
                    }
                    
                    lineNo++;
                }
            }
        }

        // check the next line for the carat indicator to determine the error position
        // (this isn't always available so we'll highlight the entire line if it's missing)
        if (errorIndicatorRegex.test(errorLines[lineNo] || '')) {
            let matches = errorLines[lineNo].match(errorIndicatorRegex) || [];
            if (matches[2] === '^') {
                caratPos = matches[1].length;
            }
            lineNo++;
        }

        // make sure the path in the ex.err file matches our document
        // (otherwise something went wrong and we'd report the wrong errors)
        if (errorPath === document.uri.fsPath) {

            // determine the line/character ranges for the error (this
            // is where we skip the carat position if it's missing)
            let diagnosticRange = new vscode.Range(
                errorLine - 1,
                caratPos !== -1 ? caratPos : 0,
                errorLine - 1,
                caratPos !== -1 ? caratPos : document.lineAt(errorLine - 1).text.length
            );

            // format the message to include the leading zeros
            let diagnosticMessage = `<${String(errorNum).padStart(4,'0')}>:: ${errorMsg}`;

            // everything is an error
            let diagnosticSeverity = vscode.DiagnosticSeverity.Error;

            // build the diagnostic info object
            let diagnosticInfo = new vscode.Diagnostic(
                diagnosticRange,
                diagnosticMessage,
                diagnosticSeverity
            );

            // assign the related inner information
            if (diagnosticRelatedList) {
                diagnosticInfo.relatedInformation = diagnosticRelatedList;
            }

            // publish the diagnostic message for this document
            diagnosticCollection.set(document.uri, [diagnosticInfo]);

        }
    }
}

//
// symbol provider builds a tree list of symbols in the document
//

class EuphoriaDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

    private stripComments(text: string): string {

        //#region strip inline block comments

        let blockCommentStart = text.indexOf('/*');

        while (blockCommentStart !== -1) {

            let blockCommentEnd = text.indexOf('*/', blockCommentStart);

            if (blockCommentEnd === -1) {
                break;
            }

            text = text.substr(0, blockCommentStart) + text.substr(blockCommentEnd+2);

            blockCommentStart = text.indexOf('/*');
        }

        //#endregion

        //#region strip single line comments

        let lineCommentStart = text.indexOf('--');

        if (lineCommentStart !== -1) {
            text = text.substring(0, lineCommentStart);
        }

        //#endregion

        return text.trimRight();
    }

    public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> 
    {
        return new Promise((resolve, reject) =>
        {
            // this is the root list of symbols
            let symbols: vscode.DocumentSymbol[] = [];

            // use a stack to indent/unindent levels
            let symbolStack = [symbols];

            for (var i = 0; i < document.lineCount; i++) {

                // get the current line
                let documentLine = document.lineAt(i).text;

                // strip single line and block comments
                documentLine = this.stripComments(documentLine);

                // skip blank lines and lines starting with comment
                if (documentLine.length === 0) {
                    continue;
                }

                //#region namespace declaration

                if (namespaceRegex.test(documentLine)) {
                    let matches = documentLine.match(namespaceRegex) || [];

                    // get the symbol details
                    let symbolName = matches[2];
                    let symbolType = matches[1];
                    let symbolKind = vscode.SymbolKind.Namespace;
                    let symbolRange = document.lineAt(i).range;

                    // build the symbol object
                    let namespaceSymbol = new vscode.DocumentSymbol(
                        symbolName,
                        symbolType,
                        symbolKind,
                        symbolRange,
                        symbolRange
                    );

                    // push the symbol onto the current stack
                    symbolStack[symbolStack.length-1].push(namespaceSymbol);

                    // indent the stack one level by using this symbol's children array
                    symbolStack.push(namespaceSymbol.children);

                    continue;
                }
                
                //#endregion

                //#region function/procedure/type declaration

                if (functionRegex.test(documentLine)) {
                    let matches = documentLine.match(functionRegex) || [];

                    // get the symbol details
                    let symbolName = matches[3];
                    let symbolType = matches[2];
                    let symbolKind = vscode.SymbolKind.Function;
                    let symbolRange = document.lineAt(i).range;
                    
                    // build the symbol object
                    let functionSymbol = new vscode.DocumentSymbol(
                        symbolName,
                        symbolType,
                        symbolKind,
                        symbolRange,
                        symbolRange
                    );

                    // TODO: parse function parameters?

                    // push the symbol onto the current stack
                    symbolStack[symbolStack.length-1].push(functionSymbol);

                    continue;
                }

                //#endregion

                //#region constant/enum declaration (single line)

                if (constantRegex.test(documentLine)) {
                    let matches = documentLine.match(constantRegex) || [];

                    // get the symbol details
                    let symbolName = matches[3];
                    let symbolType = matches[2];
                    let symbolKind = symbolType === 'constant'
                        ? vscode.SymbolKind.Constant
                        : vscode.SymbolKind.EnumMember;
                    let symbolRange = document.lineAt(i).range;
                
                    // build the symbol object
                    let constantSymbol = new vscode.DocumentSymbol(
                        symbolName,
                        symbolType,
                        symbolKind,
                        symbolRange,
                        symbolRange
                    );

                    // push the symbol onto the current stack
                    symbolStack[symbolStack.length-1].push(constantSymbol);

                    continue;
                }

                //#endregion

                //#region constant/enum declaration (multi-line)
                
                if (constantStartRegex.test(documentLine)) {
                    let matches = documentLine.match(constantStartRegex) || [];

                    // get the symbol details
                    let symbolType = matches[2];
                    let symbolKind = symbolType === 'constant'
                        ? vscode.SymbolKind.Constant
                        : vscode.SymbolKind.EnumMember;

                    // strip comments and skip empty lines
                    let currentLine = this.stripComments(document.lineAt(++i).text);
                    while (currentLine.length === 0 && i < document.lineCount) {
                        currentLine = this.stripComments(document.lineAt(++i).text);
                    }

                    // start reading symbols
                    while (constantEntryRegex.test(currentLine)) {
                        let matches = currentLine.match(constantEntryRegex) || [];

                        // get the symbol details
                        let symbolName = matches[1];
                        let symbolRange = document.lineAt(i).range;

                        // build the symbol object
                        let constantSymbol = new vscode.DocumentSymbol(
                            symbolName,
                            symbolType,
                            symbolKind,
                            symbolRange,
                            symbolRange
                        );

                        // push the symbol onto the current stack
                        symbolStack[symbolStack.length-1].push(constantSymbol);

                        // stop expecting any more symbols
                        if (!currentLine.endsWith(',')) {
                            break;
                        }

                        // strip comments and skip empty lines
                        currentLine = this.stripComments(document.lineAt(++i).text);
                        while (currentLine.length === 0 && i < document.lineCount) {
                            currentLine = this.stripComments(document.lineAt(++i).text);
                        }
                    }
                    
                    continue;
                }

                //#endregion

                //#region enum type declaration

                if (enumTypeStartRegex.test(documentLine)) {
                    let matches = documentLine.match(enumTypeStartRegex) || [];

                    // get the symbol details
                    let symbolName = matches[3];
                    let symbolType = matches[2];
                    let symbolKind = vscode.SymbolKind.Enum;
                    let symbolRange = document.lineAt(i).range;

                    // build the symbol object
                    let enumTypeSymbol = new vscode.DocumentSymbol(
                        symbolName,
                        symbolType,
                        symbolKind,
                        symbolRange,
                        symbolRange
                    );

                    // push the symbol onto the current stack
                    symbolStack[symbolStack.length-1].push(enumTypeSymbol);

                    // indent the stack one level by using this symbol's children array
                    symbolStack.push(enumTypeSymbol.children);

                    // strip comments and skip empty lines
                    let currentLine = this.stripComments(document.lineAt(++i).text);
                    while (currentLine.length === 0 && i < document.lineCount) {
                        currentLine = this.stripComments(document.lineAt(++i).text);
                    }

                    // start reading symbols
                    while (enumTypeEntryRegex.test(currentLine)) {
                        let matches = currentLine.match(enumTypeEntryRegex) || [];

                        // get the symbol details
                        let symbolName = matches[1];
                        let symbolType = 'enum';
                        let symbolKind = vscode.SymbolKind.EnumMember;
                        let symbolRange = document.lineAt(i).range;

                        // build the symbol object
                        let constantSymbol = new vscode.DocumentSymbol(
                            symbolName,
                            symbolType,
                            symbolKind,
                            symbolRange,
                            symbolRange
                        );

                        // push the symbol onto the current stack
                        symbolStack[symbolStack.length-1].push(constantSymbol);

                        // stop expecting any more symbols
                        if (!currentLine.endsWith(',')) {
                            break;
                        }

                        // strip comments and skip empty lines
                        currentLine = this.stripComments(document.lineAt(++i).text);
                        while (currentLine.length === 0 && i < document.lineCount) {
                            currentLine = this.stripComments(document.lineAt(++i).text);
                        }
                    }

                    // unindent the stack one level
                    symbolStack.pop();

                    continue;
                }

                //#endregion
            }

            // return the symbols tree
            resolve(symbols);
        });
    }
}
import * as vscode from 'vscode';
import * as fs from 'fs';
import { execFile, ChildProcess } from 'child_process';
import { TestEvent, TestInfo, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo } from 'vscode-test-adapter-api';
const pathNJS = require('path');
const processes: ChildProcess[] = Array<ChildProcess>();

export class CAcutestSuiteInfo implements TestSuiteInfo{
	type: "suite";
    id: string;
    label: string;
    description?: string | undefined;
    file?: string | undefined;
	children: (TestSuiteInfo | TestInfo)[];

	constructor(inputString: string){
		this.type = "suite";
        this.id = inputString;
        this.label = inputString;
        this.children = new Array<CAcutestTestInfo | CAcutestSuiteInfo>();
	}

}
export class CAcutestTestInfo implements TestInfo{
	type: "test";
    id: string;
    label: string;
    skipped?: boolean | undefined;

	constructor(testString: string){
		this.type = "test";
        this.id = testString;
        this.label = testString;
	}

}
let AcutestSuite: CAcutestSuiteInfo;

export function loadAcutestTests(): Promise<TestSuiteInfo> {
	var path:string = (vscode.workspace.workspaceFolders || [])[0].uri.path;
	var srcfile:string = vscode.workspace.getConfiguration('acutestExplorer').testsourceFile;
	if( path == null || srcfile == ''){
		return Promise.resolve<TestSuiteInfo>(AcutestSuite);
	}

	AcutestSuite = new CAcutestSuiteInfo('Acutest Suite');
	const subsuite = new CAcutestSuiteInfo(srcfile);
	AcutestSuite.children.push(subsuite);


	var data = fs.readFileSync( path + srcfile,'utf8');
	var index = data.indexOf('TEST_LIST');
	var test_list:string = data.slice(data.indexOf('{',index),data.indexOf('};',index));
	index = 0;
	while((index = test_list.indexOf('"', index+1 )) != -1){
		subsuite.children.push({
			type: 'test',
			id: test_list.slice(index+1,test_list.indexOf('"',index+1)),
			label: test_list.slice(index+1,test_list.indexOf('"',index+1)),
			skipped: false
		});
		index = test_list.indexOf('"',index+1)+1;
	}

	return Promise.resolve<TestSuiteInfo>(AcutestSuite);
}

export function getTestBinary(): string {
    const bin: string = (vscode.workspace.workspaceFolders || [])[0].uri.path + vscode.workspace.getConfiguration("acutestExplorer").testExecutable;
    return bin;
}

export async function runAcutests(
	tests: string[],
	testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
): Promise<void> {
	for (const suiteOrTestId of tests) {
		const node = findNode(AcutestSuite, suiteOrTestId);
		if (node) {
			await runNode(node, testStatesEmitter);
		}
	}
}

function findNode(searchNode: TestSuiteInfo | TestInfo, id: string): TestSuiteInfo | TestInfo | undefined {
    if (searchNode.id === id) {
        return searchNode;
    } else if (searchNode.type === 'suite') {
        for (const child of searchNode.children) {
            const found = findNode(child, id);
            if (found) return found;
        }
    }
    return undefined;
}

export function killTestRun() {
    processes.forEach(p => p.kill("SIGTERM"));
}

async function runNode(
	node: TestSuiteInfo | TestInfo,
	testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
): Promise<void> {

	if (node.type === 'suite') {

		testStatesEmitter.fire(<TestSuiteEvent>{ type: 'suite', suite: node.id, state: 'running' });

		for (const child of node.children) {
			await runNode(child, testStatesEmitter);
		}

		testStatesEmitter.fire(<TestSuiteEvent>{ type: 'suite', suite: node.id, state: 'completed' });

	} else { // node.type === 'test'

		testStatesEmitter.fire(<TestEvent>{ type: 'test', test: node.id, state: 'running' });
		const event:TestEvent = await runTestBinary(getTestBinary(), node.id);
		testStatesEmitter.fire(event);
	}
}

async function runTestBinary(path: string, testName:string){
	const promise: Promise<TestEvent> = new Promise<TestEvent>((resolve,reject)=>{
		const runProcess: ChildProcess = execFile(path, [testName], { cwd: path.slice(0, path.lastIndexOf(pathNJS.sep)) }, (error: any, stdout, stderr) => {
            if (error && error.code === null) {
                resolve(Promise.resolve(<TestEvent>{ type: 'test', test: testName, state: 'errored', message: stderr }));
                return;
            }
            const regexPattern: RegExp = /Test (\w)*(\.){3}\s+((\[ OK \])|\[ FAILED \])?/gs;
			
            const result: RegExpExecArray | null = regexPattern.exec(stdout)
            if (result == null) {
                reject({ "reason": "unkown" });
            }
            else {
				var passed: Boolean = (result[0].indexOf("[ OK ]")>0);
				let state: TestEvent["state"] = "passed";
				if(!passed){
					state = "failed";
				}
                console.log(result);
                const event: TestEvent = {
                    type: 'test',
                    test: new CAcutestTestInfo(testName),
                    state: state,
                    message: stdout.replace(result[0],'').trim(),
                    decorations: undefined
                }
                console.log(event);
                resolve(event);
            }
        });
		processes.push(runProcess);
	});
	return Promise.resolve(promise);

}

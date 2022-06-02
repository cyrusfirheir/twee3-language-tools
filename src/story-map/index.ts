import * as vscode from 'vscode';

import express from 'express';
import path from 'path';
import open from 'open';
import { Server } from 'http';
import * as socketio from 'socket.io';

import { updatePassages, sendPassageDataToClient, UpdatePassage } from "./socket";
import { getWorkspace, MoveData, moveToFile } from "../file-ops";

import { jumpToPassage } from '../passage';

export interface storyMapIO {
	client: socketio.Socket | undefined;
	server: Server | undefined;
	disconnectTimeout: NodeJS.Timeout | undefined;
}

export function startUI(ctx: vscode.ExtensionContext, storyMap: storyMapIO) {
	const port = 42069;

	const hostUrl = `http://localhost:${port}/`;
	const storyMapPath = path.join(ctx.extensionPath, 'res/story-map');

	const app = express();
	app.use(express.static(storyMapPath));

	storyMap.server = new Server(app);
	storyMap.server.listen(port, () => console.log(`Server connected on ${hostUrl}`));

	const inVSC = vscode.workspace.getConfiguration("twee3LanguageTools.storyMap").get("windowType", "VSCode") === "VSCode";
	
	const io = new socketio.Server(storyMap.server, { cors: { origin: 'http://localhost:8080' } });
	io.on('connection', (client: socketio.Socket) => {
		if (storyMap.client) storyMap.client.disconnect(true);
		if (storyMap.disconnectTimeout) clearTimeout(storyMap.disconnectTimeout);

		storyMap.client = client;
		console.log('client connected');
		sendPassageDataToClient(ctx, client);

		client
			.on('open-passage', jumpToPassage)
			.on('update-passages', async (passages: UpdatePassage[]) => {
				await updatePassages(ctx, passages);
				sendPassageDataToClient(ctx, client);
			})
			.on('disconnect', () => {
				if (!inVSC) disconnectHandler(storyMap);
			})
			.on('move-to-file', async (moveData: MoveData) => {
				await moveToFile(ctx, moveData);
				sendPassageDataToClient(ctx, client);
			})
			.on('get-twee-workspace', async () => {
				const ws = await getWorkspace();
				client.emit('twee-workspace', ws);
			});
	});
	
	if (inVSC) {
		const panel = vscode.window.createWebviewPanel("t3lt.storyMap", "Story Map", vscode.ViewColumn.Beside, {
			enableScripts: true
		});
		
		panel.webview.html = `<!DOCTYPE html><html lang="en"><body style="height: 100vh; padding: 0;"><iframe style="height: 100%; width: 100%; border: none;" src="${hostUrl}"></iframe></body></html>`;

		panel.onDidDispose(e => stopUI(storyMap));

		const firstLaunchLock = panel.onDidChangeViewState(() => {
			vscode.commands.executeCommand("workbench.action.lockEditorGroup");
			firstLaunchLock.dispose();
		});
	} else {
		open(hostUrl);
	}

	vscode.commands.executeCommand('setContext', 't3lt.storyMap', true);
}

function disconnectHandler(storyMap: storyMapIO) {
	console.log('client disconnected');
	storyMap.client = undefined;
	storyMap.disconnectTimeout = setTimeout(() => {
		if (!storyMap.client) stopUI(storyMap);
	}, vscode.workspace.getConfiguration("twee3LanguageTools.storyMap").get("unusedPortClosingDelay", 5000));
}

export function stopUI(storyMap: storyMapIO) {
	storyMap.client?.disconnect(true);
	storyMap.server?.close(() => vscode.commands.executeCommand('setContext', 't3lt.storyMap', false));
}
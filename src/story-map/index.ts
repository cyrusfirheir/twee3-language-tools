import * as vscode from 'vscode';

import express from 'express';
import path from 'path';
import open from 'open';
import { Server } from 'http';
import * as socketio from 'socket.io';

import { updatePassages, sendPassageDataToClient } from "./socket";
import { getWorkspace, MoveData, moveToFile } from "../file-ops";

import { jumpToPassage } from '../tree-view';

export interface storyMapIO {
	client: socketio.Socket | undefined;
	server: Server | undefined;
	disconnectTimeout: NodeJS.Timeout | undefined;
}

export function startUI(ctx: vscode.ExtensionContext, storyMap: storyMapIO) {
	const port = 42069;

	const hostUrl = `http://localhost:${port}/`
	const storyMapPath = path.join(ctx.extensionPath, 'res/story-map');

	const app = express();
	app.use(express.static(storyMapPath));

	storyMap.server = new Server(app);
	storyMap.server.listen(port, () => console.log(`Server connected on ${hostUrl}`));

	const io = new socketio.Server(storyMap.server, { cors: { origin: 'http://localhost:8080' } });
	io.on('connection', (client: socketio.Socket) => {
		if (storyMap.client) storyMap.client.disconnect(true);
		if (storyMap.disconnectTimeout) clearTimeout(storyMap.disconnectTimeout);

		storyMap.client = client;
		console.log('client connected');
		sendPassageDataToClient(ctx, client);

		client
			.on('open-passage', jumpToPassage)
			.on('update-passages', updatePassages)
			.on('disconnect', () => {
				console.log('client disconnected');
				storyMap.client = undefined;
				storyMap.disconnectTimeout = setTimeout(() => {
					if (!storyMap.client) stopUI(storyMap);
				}, vscode.workspace.getConfiguration("twee3LanguageTools.storyMap").get("unusedPortClosingDelay", 5000));
			})
			.on('move-to-file', async (moveData: MoveData) => {
				await moveToFile(moveData);
				console.log(ctx.workspaceState.get("passages"));
				// sendPassageDataToClient(ctx, client);			
			})
			.on('get-twee-workspace', async () => {
				const ws = await getWorkspace();
				client.emit('twee-workspace', ws);
			});
	});
	open(hostUrl);
	vscode.commands.executeCommand('setContext', 't3lt.storyMap', true);
}

export function stopUI(storyMap: storyMapIO) {
	storyMap.client?.disconnect(true);
	storyMap.server?.close(() => vscode.commands.executeCommand('setContext', 't3lt.storyMap', false));
}
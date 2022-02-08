<template>
    <transition name="open">
        <div class="save-to-file-overlay" v-if="isOpen">
            <div class="save-to-file-dialog">
                <div class="dialog-titlebar">
                    <span class="title">Move passages to file</span>
                    <button class="close" @click="cancel()">Close</button>
                </div>
                <div class="dialog-toolbar">
                    <button type="button" data-action="back" @click="historyBack()" :disabled="historyBackDisabled">Back</button>
                    <button type="button" data-action="next" @click="historyNext()" :disabled="historyNextDisabled">Next</button>
                    <button type="button" data-action="up" @click="gotoFolder(selectedFolder.parent)" :disabled="!selectedFolder || !selectedFolder.parent">Up</button>
                    <div class="breadcrumbs">
                        <button v-for="breadcrumb in breadcrumbs" type="button" class="breadcrumb" @click="gotoFolder(breadcrumb)" :key="`breadcrumb-${breadcrumb.relativePath}/${breadcrumb.name}`">
                            {{ breadcrumb.name }}
                        </button>
                    </div>
                    <input type="search" placeholder="Filter" v-model="filterModel">
                </div>
                <div class="dialog-body">
                    <template v-if="isLoading">
                        <div class="loading">Loading</div>
                    </template>
                    <template v-else>
                        <div class="folder-tree">
                            <!-- Todo -->
                            <template v-for="rootFolder in rootFolders">
                                <WorkspaceTree :root="rootFolder" :selectedFolder="selectedFolder" :key="`workspace-tree-${rootFolder.name}`" @selectFolder="gotoFolder($event)" />
                            </template>
                        </div>
                        <div class="folder-content">
                            <div class="folder-items">
                                <!-- folders -->
                                <div
                                    class="folder-item"
                                    :class="{ highlight: highlightedFolder === folder }"
                                    v-for="folder in contentInSelectedFolder.folders"
                                    :key="`folder-item-${folder.relativePath}/${folder.name}`"
                                    @click="highlightFolder(folder)"
                                    @dblclick="gotoFolder(folder)"
                                >
                                    <img src="/Folder.svg">
                                    <span class="name">{{ folder.name }}</span>
                                </div>
                                <!-- files -->
                                <div
                                    class="file-item"
                                    :class="{ highlight: selectedFile === file }"
                                    v-for="file in contentInSelectedFolder.files"
                                    :key="`file-item-${file.parent.relativePath}/${file.name}`"
                                    @click="selectFile(file)"
                                    @dblclick="openFile(file)"
                                >
                                    <img src="/File.svg">
                                    <span class="name">{{ file.name }}</span>
                                </div>
                            </div>
                            <!-- file-entry -->
                            <div class="filename-entry">
                                <input type="text" placeholder="Filename" v-model="saveToFile">
                            </div>
                        </div>
                    </template>
                </div>
                <div class="dialog-actions">
                    <button type="button" class="cancel" @click="cancel()">Cancel</button>
                    <button type="button" class="save" :disabled="saveDisabled" @click="save()">Move to file</button>
                </div>
            </div>
        </div>
    </transition>
</template>

<script lang="ts">
import { Component, Vue } from "vue-property-decorator";
import { socket } from "../socket";
import { TweeWorkspaceFolder, TweeWorkspaceFile, TweeWorkspaceFolderContent } from '../types';
import WorkspaceTree from './WorkspaceTree.vue';

const assignParentage = (item: TweeWorkspaceFolder | TweeWorkspaceFile, parent: TweeWorkspaceFolder | null) => {
    item.parent = parent;
    if ('content' in item) {
        for (const childFolder of item.content.folders) {
            assignParentage(childFolder, item);
        }
        for (const childFile of item.content.files) {
            assignParentage(childFile, item);
        }
    }
};

@Component({
    components: {
        WorkspaceTree,
    },
})
export default class SaveToFile extends Vue {
    isOpen = false;
    rootFolders: TweeWorkspaceFolder[] = [];
    selectedFolder: TweeWorkspaceFolder = null;
    selectedFile: TweeWorkspaceFile = null;
    selectedFolderHistory: TweeWorkspaceFolder[] = [];
    selectedFolderHistoryIndex = 0;
    highlightedFolder: TweeWorkspaceFolder | null = null;
    filterModel = '';
    saveToFile = '';

    get breadcrumbs() {
        const breadcrumbs: TweeWorkspaceFolder[] = [];
        let folder = this.selectedFolder;
        while (folder) {
            breadcrumbs.unshift(folder);
            folder = folder.parent;
        }
        return breadcrumbs;
    }
    
    get isLoading() {
        return this.rootFolders.length === 0 || !this.selectedFolder;
    }

    get saveDisabled() {
        return !this.saveToFile;
    }

    get historyBackDisabled() {
        return this.selectedFolderHistoryIndex <= 1;
    }

    get historyNextDisabled() {
        return this.selectedFolderHistoryIndex >= this.selectedFolderHistory.length;
    }

    get contentInSelectedFolder(): TweeWorkspaceFolderContent {
        const selectedFolder = this.selectedFolder;
        const filter = this.filterModel.toLowerCase();
        if (!selectedFolder) {
            return {
                folders: [],
                files: [],
            };
        } else {
            return {
                folders: selectedFolder.content.folders.filter((folder) => !filter || folder.name.toLowerCase().includes(filter)),
                files: selectedFolder.content.files.filter((file) => !filter || file.name.toLowerCase().includes(filter)),
            };
        }
    }

    created() {
        socket.once('twee-workspace', (rootFolders: TweeWorkspaceFolder[]) => {
            for (const rootFolder of rootFolders) {
                assignParentage(rootFolder, null);
            }
            this.selectedFolder = rootFolders[0];
            this.rootFolders = rootFolders;
            this.selectedFolderHistory = [ rootFolders[0] ];
            this.selectedFolderHistoryIndex = 1;
        });
        socket.emit('get-twee-workspace');
    }

    mounted() {
        this.isOpen = true;
    }

    gotoFolder(folder: TweeWorkspaceFolder) {
        this.clearHighlight();
        this.selectedFolder = folder;
        this.selectedFolderHistory = [...this.selectedFolderHistory.slice(0, this.selectedFolderHistoryIndex), folder];
        this.selectedFolderHistoryIndex++;
    }

    historyBack() {
        if (this.selectedFolderHistoryIndex > 1) {
            this.clearHighlight();
            this.selectedFolderHistoryIndex--;
            this.selectedFolder = this.selectedFolderHistory[this.selectedFolderHistoryIndex - 1];
        }
    }

    historyNext() {
        if (this.selectedFolderHistoryIndex < this.selectedFolderHistory.length) {
            this.clearHighlight();
            this.selectedFolderHistoryIndex++;
            this.selectedFolder = this.selectedFolderHistory[this.selectedFolderHistoryIndex - 1];
        }
    }

    clearHighlight() {
        this.selectedFile = null;
        this.highlightedFolder = null;
    }

    highlightFolder(folder: TweeWorkspaceFolder) {
        this.clearHighlight();
        this.highlightedFolder = folder;
    }

    selectFile(file: TweeWorkspaceFile) {
        this.clearHighlight();
        this.selectedFile = file;
        this.saveToFile = file.name;
    }

    openFile(file: TweeWorkspaceFile) {
        this.selectFile(file);
        this.save();
    }

    save() {
        this.$emit('save', this.selectedFolder.absolutePath + `/${this.saveToFile}`);
    }

    cancel() {
        this.$emit('cancel');
    }
}
</script>

<style lang="scss" scoped>
%icon-button {
    position: relative;
    text-indent: -100vw;
    overflow: hidden;
    color: transparent;
    font-size: 0;
    background-color: transparent;
    border: 0;
    cursor: pointer;
    outline: 0;

    &::before, &::after {
        font-size: 30px;
        color: #FFF;
        text-indent: 0;
        position: absolute;
        display: flex;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        justify-content: center;
        align-items: center;
    }

    &:hover {
        background-color: rgba(255, 255, 255, .08);
    }

    &[disabled]::before,
    &[disabled]::after {
        color: #999;
    }
}

%custom-scrollbars {
    scrollbar-color: rgba(255, 255, 255, .1) transparent;
    scrollbar-width: thin;

    &::-webkit-scrollbar {
        width: 5px;
        height: 8px;
        background-color: transparent;
    }

    &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0);
    }

    &:hover::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, .1);
    }
}

.save-to-file-overlay {
    position: fixed;
    display: flex;
    justify-content: center;
    align-items: center;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
    background-color: rgba(0, 0, 0, .5);
}

.save-to-file-dialog {
    display: flex;
    flex-direction: column;
    width: 1000px;
    height: 600px;
    background-color: rgb(30, 30, 30);

    .dialog-titlebar {
        display: flex;
        align-items: center;
        background-color: rgba(60, 60, 60);
        color: #CCC;

        .title {
            flex: 1;
            padding: 0 10px;
            font-family: 'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', 'Lucida Sans', Arial, sans-serif;
            font-size: 18px;
        }

        .close {
            @extend %icon-button;
            width: 40px;
            height: 40px;

            &::before {
                content: '\00d7';
            }
        }
    }

    .dialog-toolbar {
        display: flex;
        justify-content: flex-start;
        align-items: center;

        > button {
            @extend %icon-button;
            width: 40px;
            height: 39px;
            border-right: solid rgba(255, 255, 255, .1) 1px;
            border-bottom: solid rgba(255, 255, 255, .1) 1px;

            &[data-action="back"] {
                &::before {
                    content: '';
                    display: block;
                    border: solid #FFF;
                    border-width: 0 0 2px 2px;
                    transform: translate(-50%, -50%) translate(3px, 0) rotate(45deg);
                    height: 10px;
                    width: 10px;
                }
            }
            &[data-action="next"] {
                &::before {
                    content: '';
                    display: block;
                    border: solid #FFF;
                    border-width: 2px 2px 0 0;
                    transform: translate(-50%, -50%) translate(-3px, 0) rotate(45deg);
                    height: 10px;
                    width: 10px;
                }
            }
            &[data-action="up"] {
                &::before {
                    content: '';
                    display: block;
                    border: solid #FFF;
                    border-width: 2px 0 0 2px;
                    transform: translate(-50%, -50%) translate(0, 3px) rotate(45deg);
                    height: 10px;
                    width: 10px;
                }
            }
            &[data-action][disabled] {
                pointer-events: none;

                &::before {
                    border-color: #444;
                }
            }
        }

        .breadcrumbs {
            display: flex;
            flex: 1;
            background-color: rgb(40, 40, 40);
            border: solid rgba(60, 60, 60);
            border-width: 0 1px 1px;

            button {
                display: flex;
                align-items: center;
                border: 0;
                background: transparent;
                color: #FFF;
                gap: 7px;
                height: 38px;
                padding: 0 10px 0 5px;
                cursor: pointer;
                outline: 0;

                &:hover {
                    background-color: rgba(255, 255, 255, .2);
                }

                &::before {
                    display: inline-block;
                    content: '';
                    width: 7px;
                    height: 7px;
                    border: solid #FFF;
                    border-width: 2px 2px 0 0;
                    transform: rotate(45deg);
                }
            }
        }

        input {
            border: 0;
            height: 40px;
            padding: 0 10px;

            background-color: rgb(75, 75, 75);
            color: #FFF;
            outline: 0;
        }
    }

    .dialog-body {
        display: flex;
        height: calc(600px - 120px);
        flex: 1;

        .loading {
            display: flex;
            width: 100%;
            height: 100%;
            justify-content: center;
            align-items: center;
        }

        .folder-tree {
            @extend %custom-scrollbars;
            width: 250px;
            height: calc(600px - 120px);
            background-color: rgb(37, 37, 37);
            overflow: auto;
            overflow: overlay;
        }

        .folder-content {
            position: relative;
            flex: 1;
        }

        .folder-items {
            display: flex;
            flex: 1;
            flex-wrap: wrap;
            align-items: flex-start;
            justify-content: flex-start;
            align-content: flex-start;
            height: calc(600px - 160px);
            overflow: auto;

            .folder-item,
            .file-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                width: 115px;
                line-height: 20px;
                margin: 10px;
                overflow: hidden;
                color: #FFF;
                cursor: default;
                padding: 5px;

                img {
                    width: 70px;
                    height: 70px;
                }

                .name {
                    text-align: center;
                    font-family: Verdana, Geneva, Tahoma, sans-serif;
                    font-size: 11px;
                    word-break: break-all;
                }

                &:hover,
                &.highlight {
                    background-color: rgba(255, 255, 255, .13);
                }
            }
        }

        .filename-entry {
            display: flex;
            height: 40px;
            align-items: center;
            justify-content: flex-end;
            padding: 5px;

            input {
                display: block;
                height: 30px;
                width: 100%;
                border: 0;
                background-color: #444;
                padding: 0 10px;
                color: #CCC;
            }
        }
    }

    .dialog-actions {
        display: flex;
        justify-content: flex-end;
        border-top: solid #555 1px;
        gap: 10px;

        button {
            height: 40px;
            border: 0;
            background-color: rgba(255, 255, 255, .05);
            color: #FFF;
            padding: 0 20px;
            cursor: pointer;
            font-size: 20px;
            font-family: 'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', 'Lucida Sans', Arial, sans-serif;

            &:hover {
                background-color: rgba(255, 255, 255, .1);
            }

            &[disabled] {
                pointer-events: none;
                color: rgba(255, 255, 255, .3);
            }
        }
    }
}
</style>
<template>
    <transition name="open">
        <div class="save-to-file-overlay" v-if="isOpen">
            <div class="save-to-file-dialog">
                <div class="dialog-titlebar">
                    <span class="title">Save passages to file</span>
                    <button class="close" @click="cancel()">Close</button>
                </div>
                <div class="dialog-body">
                    <template v-if="isLoading">
                        <div class="loading">Loading</div>
                    </template>
                    <template v-else>
                        <div class="toolbar">
                            <button type="button" data-action="back" @click="historyBack()" :disabled="historyBackDisabled">Back</button>
                            <button type="button" data-action="next" @click="historyNext()" :disabled="historyNextDisabled">Next</button>
                            <button type="button" data-action="up" @click="gotoFolder(selectedFolder.parent)" :disabled="!selectedFolder.parent">Up</button>
                            <div class="breadcrumbs">
                                <button v-for="breadcrumb in breadcrumbs" type="button" class="breadcrumb" @click="gotoFolder(breadcrumb)" :key="`breadcrumb-${breadcrumb.relativePath}/${breadcrumb.name}`">
                                    {{ breadcrumb.name }}
                                </button>
                            </div>
                            <input type="search" placeholder="Filter" v-model="filterModel">
                        </div>
                        <div class="folder-content">
                            <div class="folder-tree">
                                <!-- Todo -->
                                <template v-for="rootFolder in rootFolders">
                                    <WorkspaceTree :root="rootFolder" :selected="selectedFolder" :key="`workspace-tree-${rootFolder.name}`" />
                                </template>
                            </div>
                            <div class="folder-items">
                                <div class="filter" v-if="filterModel">Items in folder die aan filter '{{ filter }}' voldoen</div>
                                <!-- folders -->
                                <div
                                    class="folder-item"
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
                                    v-for="file in contentInSelectedFolder.files"
                                    :key="`file-item-${file.parent.relativePath}/${file.name}`"
                                    @click="highlightFile(file)"
                                    @dblclick="openFile(file)"
                                >
                                    <img src="/File.svg">
                                    <span class="name">{{ file.name }}</span>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
                <div class="dialog-actions">
                    <button type="button" class="cancel" @click="cancel()">Cancel</button>
                    <button type="button" class="save" :disabled="saveDisabled" @click="save()">Save to file</button>
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
    selectedFolderIndex = 0;
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
        return this.selectedFile === null;
    }

    get historyBackDisabled() {
        return this.selectedFolderIndex <= 1;
    }

    get historyNextDisabled() {
        return this.selectedFolderIndex < this.selectedFolderHistory.length;
    }

    get contentInSelectedFolder(): TweeWorkspaceFolderContent {
        const selectedFolder = this.selectedFolder;
        const filter = this.filterModel;
        if (!selectedFolder) {
            return {
                folders: [],
                files: [],
            };
        } else {
            return {
                folders: selectedFolder.content.folders.filter((folder) => !filter || folder.name.includes(filter)),
                files: selectedFolder.content.files.filter((file) => !filter || file.name.includes(filter)),
            };
        }
    }

    created() {
        console.log('SaveToFile', this);
        socket.once('twee-workspace', (rootFolders: TweeWorkspaceFolder[]) => {
            // TODO: Before I do the stuff below, I will have to traverse to set all of the proper parent values
            for (const rootFolder of rootFolders) {
                assignParentage(rootFolder, null);
            }
            this.selectedFolder = rootFolders[0];
            this.rootFolders = rootFolders;
            this.selectedFolderHistory = [ rootFolders[0] ];
            this.selectedFolderIndex = 1;
        });
        socket.emit('get-twee-workspace');
    }

    mounted() {
        this.isOpen = true;
    }

    gotoFolder(folder: TweeWorkspaceFolder) {
        this.selectedFolder = folder;
        this.selectedFolderHistory = [...this.selectedFolderHistory.slice(0, this.selectedFolderIndex), folder];
        this.selectedFolderIndex++;
    }

    historyBack() {
        if (this.selectedFolderIndex > 1) {
            this.selectedFolderIndex--;
            this.selectedFolder = this.selectedFolderHistory[this.selectedFolderIndex];
        }
    }

    historyNext() {
        if (this.selectedFolderIndex < this.selectedFolderHistory.length) {
            this.selectedFolderIndex++;
            this.selectedFolder = this.selectedFolderHistory[this.selectedFolderIndex];
        }
    }

    refreshFolder() {
        // TODO: Not sure how to implement this
    }

    highlightFolder(folder: TweeWorkspaceFolder) {
        
    }

    highlightFile(file: TweeWorkspaceFile) {
        
    }

    openFile(file: TweeWorkspaceFile) {

    }

    save() {
        this.$emit('save', this.breadcrumbs.map((breadcrumb) => breadcrumb.name).join('/') + `/${this.saveToFile}`);
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

    .dialog-body {
        flex: 1;

        .loading {
            display: flex;
            width: 100%;
            height: 100%;
            justify-content: center;
            align-items: center;
        }

        .toolbar {
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

        .folder-content {
            display: flex;

            .folder-tree {
                width: 250px;
            }

            .folder-items {
                display: flex;
                flex: 1;
                flex-wrap: wrap;

                .filter {
                    width: 100%;
                }

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

                    &:hover {
                        background-color: rgba(255, 255, 255, .13);
                    }
                }

                .folder-item {

                }
            }
        }
    }

    .dialog-actions {
        display: flex;
        justify-content: flex-end;

        button {

        }
    }
}
</style>
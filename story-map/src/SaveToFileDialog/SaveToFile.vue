<template>
    <transition name="open">
        <div class="save-to-file-overlay" v-if="isLoading">
            <div class="save-to-file-dialog">
                <div class="dialog-titlebar">
                    <span class="title">Save passages to file</span>
                    <button class="close" @click="cancel()">Close</button>
                </div>
                <div class="dialog-body">
                    <template v-if="isLoading">
                    </template>
                    <template v-else>
                        <div class="toolbar">
                            <button type="button" data-action="back" @click="historyBack()" :disabled="historyBackDisabled">Back</button>
                            <button type="button" data-action="next" @click="historyNext()" :disabled="historyNextDisabled">Next</button>
                            <button type="button" data-action="up" @click="gotoFolder(selectPassage.parent)" :disabled="!selectPassage.parent">Up</button>
                            <div class="breadcrumbs">
                                <button v-for="breadcrumb in breadcrumbs" type="button" class="breadcrumb" @click="gotoFolder(breadcrumb)" :key="`breadcrumb-${breadcrumb.relativePath}/${breadcrumb.name}`">
                                    {{ breadcrumb.name }}
                                </button>
                            </div>
                            <button type="button" data-action="refresh" @click="refreshFolder()">Refresh</button>
                            <input type="search" placeholder="Filter" v-model="filterModel">
                        </div>
                        <div class="folder-content">
                            <div class="folder-tree">
                                <!-- Todo -->
                                <FolderTreeLevel :folder="root" :selected="selectedFolder">
                            </div>
                            <div class="folder-content">
                                <div class="filter" v-if="filterModel">Items in folder die aan filter '{{ filter }}' voldoen</div>
                                <!-- folders -->
                                <div
                                    class="folder-item"
                                    v-for="folder in selectedFolder.content.folders"
                                    :key="`folder-item-${folder.relativePath}/${folder.name}`"
                                    @click=""
                                    @dblclick=""
                                >
                                    {{ folder.name }}
                                </div>
                                <!-- files -->
                                <div
                                    class="file-item"
                                    v-for="file in selectedFolder.content.files"
                                    :key="`file-item-${file.parent.relativePath}/${file.name}`"
                                    @click=""
                                    @dblclick=""
                                >
                                    {{ file.name }}
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

@Component
export default class SaveToFile extends Vue {
    isOpen = false;
    root: TweeWorkspaceFolder = null;
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
        return this.root === null;
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
        socket.once('twee-workspace', (rootFolder: TweeWorkspaceFolder) => {
            // TODO: Before I do the stuff below, I will have to traverse to set all of the proper parent values
            this.root = rootFolder;
            this.selectedFolderHistory = [ rootFolder ];
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

    save() {
        this.$emit('save', this.breadcrumbs.map((breadcrumb) => breadcrumb.name).join('/') + `/${this.saveToFile}`);
    }

    cancel() {
        this.$emit('cancel');
    }
}
</script>

<style lang="scss" scoped>

</style>
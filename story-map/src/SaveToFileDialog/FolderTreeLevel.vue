<template>
    <div class="workspace-folder" :class="{ selected: folder === selectedFolder }">
        <div class="workspace-folder-title" @click="toggleCollapse(); selectFolder(folder)">
            <span class="arrow-btn" :class="{ collapsed, hidden: arrowHidden }" @click.stop="toggleCollapse()"></span>
            {{ folder.name }}
        </div>
        <Collapsible class="workspace-folder-content" :collapsed="collapsed" :class="{ ['collapsible-collapsed']: collapsed }">
            <template v-for="subfolder in folder.content.folders">
                <FolderTreeLevel :folder="subfolder" :selectedFolder="selectedFolder" :key="`FolderTreeLevel-${subfolder.relativePath}`" @selectFolder="selectFolder($event)" />
            </template>
        </Collapsible>
    </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from "vue-property-decorator";
import { TweeWorkspaceFolder } from '../types';
import Collapsible from './Collapsible.vue'

@Component({
    name: 'FolderTreeLevel',
    components: {
        Collapsible,
    },
})
export default class FolderTreeLevel extends Vue {
    @Prop() folder: TweeWorkspaceFolder;
    @Prop() selectedFolder: TweeWorkspaceFolder;
    collapsed = true;

    get arrowHidden() {
        return this.folder.content.folders.length === 0;
    }

    selectFolder(folder: TweeWorkspaceFolder) {
        this.$emit('selectFolder', folder);
    }

    toggleCollapse() {
        this.collapsed = !this.collapsed;
    }

    @Watch('selectedFolder')
    expandIfSelected() {
        if (!this.collapsed) return;

        if (this.folder === this.selectedFolder || this.isDescendantSelected(this.folder)) {
            this.collapsed = false;
        }
    }

    isDescendantSelected(folder: TweeWorkspaceFolder): boolean {
        return folder.content.folders.some((subfolder) => {
            if (subfolder === this.selectedFolder) return true;
            if (this.isDescendantSelected(subfolder)) return true;
            return false;
        });
    }
}
</script>

<style lang="scss" scoped>
.workspace-folder {
    padding-left: 8px;
}
.workspace-folder-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #DDD;
    font-weight: bold;
    padding: 4px 8px;
    cursor: pointer;

    &:hover::before {
        content: ' ';
        white-space: pre;
        position: absolute;
        left: 0;
        right: 0;
        background-color: rgba(255, 255, 255, .05);
        line-height: 24px;
    }

    .selected > &::after {
        content: ' ';
        white-space: pre;
        position: absolute;
        left: 0;
        right: 0;
        background-color: rgba(255, 255, 255, .05);
        line-height: 24px;

        .collapsible-collapsed & {
            display: none;
        }
    }
}

.arrow-btn {
    width: 8px;
    height: 8px;
    border: solid 1px;
    border-color: transparent white white transparent;
    transition: transform .2s ease-in-out;
    transform: translateY(-2px) rotate(45deg);

    &.collapsed {
        transform: translateX(-2px) rotate(-45deg);
    }

    &.hidden {
        opacity: 0;
    }
}
</style>
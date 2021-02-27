<template>
    <div class="workspace-tree" :class="{ selected: root === selectedFolder }">
        <div class="workspace-tree-title" @click="toggleCollapse(); selectFolder(root)">
            <span class="arrow-btn" :class="{ collapsed }"></span>
            {{ root.name }}
        </div>
        <Collapsible class="workspace-tree-content" :collapsed="collapsed" :class="{ ['collapsible-collapsed']: collapsed }">
            <template v-for="folder in root.content.folders">
                <FolderTreeLevel :folder="folder" :selectedFolder="selectedFolder" :key="`FolderTreeLevel-${folder.relativePath}`" @selectFolder="selectFolder($event)" />
            </template>
        </Collapsible>
    </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from "vue-property-decorator";
import { TweeWorkspaceFolder } from '../types';
import FolderTreeLevel from './FolderTreeLevel.vue'
import Collapsible from './Collapsible.vue'

@Component({
    components: {
        FolderTreeLevel,
        Collapsible,
    },
})
export default class WorkspaceTwee extends Vue {
    @Prop() root: TweeWorkspaceFolder;
    @Prop() selectedFolder: TweeWorkspaceFolder;
    collapsed = false;

    async toggleCollapse() {
        // Invert the collapse state
        this.collapsed = !this.collapsed;
    }

    selectFolder(folder: TweeWorkspaceFolder) {
        this.$emit('selectFolder', folder);
    }
}
</script>

<style lang="scss" scoped>
.workspace-tree {
    position: relative;
}

.workspace-tree-title {
    display: flex;
    align-items: center;
    gap: 8px;
    border-top: solid #444 1px;
    border-bottom: solid #111 2px;
    font-size: 14px;
    color: #DDD;
    font-weight: bold;
    padding: 4px 8px;
    cursor: pointer;

    .selected > & {
        background-color: #333;
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
}
</style>
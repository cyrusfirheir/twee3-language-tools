<template>
    <div>WorkspaceTwee</div>
</template>

<script lang="ts">
import { Component, Vue } from "vue-property-decorator";
import { socket } from "../socket";
import { TweeWorkspaceFolder, TweeWorkspaceFile, TweeWorkspaceFolderContent } from '../types';
import FolderTreeLevel from './FolderTreeLevel.vue'

@Component({
    components: {
        FolderTreeLevel,
    },
})
export default class WorkspaceTwee extends Vue {
}
</script>

<style lang="scss" scoped>

</style>
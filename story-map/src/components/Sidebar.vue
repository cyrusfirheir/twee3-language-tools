<template>
    <div class="sidebar-outer" v-if="passage">
        <h3>{{ passage.name }}</h3>

        <p v-for="prop in props" :key="prop">
            <strong>{{prop}}:</strong><br>
            {{ passage[prop] }}
        </p>
    </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from "vue-property-decorator";
import { Passage } from "../types";

@Component
export default class Sidebar extends Vue {
    @Prop() passage!: Passage;
    @Prop() tags: string[] = ['style', 'script'];

    props = ['filename', 'key', 'linksToNames', 'name', 'origin', 'position', 'size', 'tags', 'path'];

    @Watch('passage')
    logPassage() {
        console.log(this.passage);
    }

    // reset position
    // change tags
    // open in vscode
    // size
}

</script>

<style lang="scss" scoped>
    .sidebar-outer {
        height: 100%;
        width: 350px;
        overflow: auto;
        overflow-x: hidden;
        color: #FFF;
    }
</style>
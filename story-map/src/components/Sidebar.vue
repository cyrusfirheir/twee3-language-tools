<template>
    <div class="sidebar-outer" v-if="passage">
        <button class="close">Close</button>
        <h3>{{ passage.name }}</h3>
        
        <h4>Path</h4>
        <code class="block">
            {{ passage.origin }}
        </code>

        <h4>Links</h4>
        <a v-for="name in linksToNames" :key="`link-to-${name}`" href="#" @click.prevent="selectPassage(name)">{{ name }}</a>

        <h4>Tags</h4>
        <div v-for="tag in tags" :key="`passage-tag-${tag}`">
            {{ tag }} <button class="remove-tag">Remove</button>
        </div>
        <div class="add-tag-wrapper">
            <input type="text" v-model="addTagModel">
            <button class="add-tag">Add tag</button>
            <div class="tag-suggestion-list" v-if="tagSuggestions">
                <div
                    v-for="suggestion in tagSuggestions"
                    :key="`tag-suggestion-${suggestion}`"
                    class="tag-suggestion"
                    @click="addTag(suggestion)"
                >
                    {{ suggestion }}
                </div>
            </div>
        </div>

        <h4>Size</h4>
        <button
            v-for="sizeOption in sizeOptions"
            :key="`size-option-${sizeOption.x}x${sizeOption.y}`"
            class="size"
            :class="{ active: isSize(sizeOption) }"
            @click="setSize(sizeOption)"
        >
            100 &times; 100
        </button>

        <h4>Actions</h4>
        <button class="action">Reset position</button>
        <button class="action">Reset size</button>
        <button class="action">Move to file</button>
        <button class="action">Hide</button>
        <button class="action">Open in VSCode</button>
    </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from "vue-property-decorator";
import { Passage, Vector } from "../types";

@Component
export default class Sidebar extends Vue {
    @Prop() passage!: Passage;
    @Prop() allTags: string[] = [];
    @Prop() tagColors: { [tag: string]: string } = {};

    props = ['filename', 'key', 'linksToNames', 'name', 'origin', 'position', 'size', 'tags', 'path'];
    tagSuggestions: string[] | null = null;
    activeTagSuggestion = '';
    addTagModel = '';
    sizeOptions: Vector[] = [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 100, y: 200 },
        { x: 200, y: 200 },
    ];

    @Watch('passage')
    logPassage() {
        console.log(this.passage);
    }

    selectPassage(name: string) {
        this.$emit('select-passage', name);
    }

    addTag(tag: string) {
        this.$emit('add-tag', tag);
    }

    setSize(size: Vector) {
        this.$emit('set-size', size);
    }

    isSize(size: Vector) {
        return this.passage && this.passage.size.x === size.x && this.passage.size.y === size.y;
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
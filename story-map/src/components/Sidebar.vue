<template>
    <div class="sidebar-outer" v-if="passage">
        <header class="titlebar">
            <h3>{{ passage.name }}</h3>
            <button class="close">Close</button>
        </header>
        
        <h4>Path</h4>
        <code class="block">
            {{ passage.origin.path }}
        </code>

        <h4>Links</h4>
        <a
            v-for="name in passage.linksToNames"
            :key="`link-to-${name}`"
            @click.prevent="selectPassage(name)"
            href="#"
            class="passage-link"
        >
            {{ name }}
        </a>

        <h4>Tags</h4>
        <div v-for="tag in passage.tags" :key="`passage-tag-${tag}`" class="passage-tag">
            {{ tag }} <button class="remove-tag">Remove</button>
        </div>
        <div class="add-tag-wrapper">
            <input type="text" v-model="addTagModel">
            <button class="add-tag-btn">Add tag</button>
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
        <div class="size-options">
            <button
                v-for="sizeOption in sizeOptions"
                :key="`size-option-${sizeOption.x}x${sizeOption.y}`"
                class="size-btn"
                :class="{ active: isSize(sizeOption) }"
                @click="setSize(sizeOption)"
            >
                {{ sizeOption.x }} &times; {{ sizeOption.y }}
            </button>
        </div>

        <h4>Actions</h4>
        <div class="actions">
            <button class="action" disabled>Reset position</button>
            <button class="action">Reset size</button>
            <button class="action">Move to file</button>
            <button class="action">Hide</button>
            <button class="action">Open in VSCode</button>
        </div>

        <h1>Disclaimer</h1>
        <p>most of the stuff above doesnt do anything</p>
    </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from "vue-property-decorator";
import { Passage, Vector } from "../types";

@Component
export default class Sidebar extends Vue {
    @Prop() passage!: Passage;
    @Prop({ default: () => []}) allTags!: string[];
    @Prop({ default: () => ({})}) tagColors!: { [tag: string]: string };

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
        width: 450px;
        overflow: auto;
        overflow-x: hidden;
        color: #FFF;
        padding: 20px;
        position: relative;
    }

    .titlebar {
        display: flex;
        align-items: center;
        
        h3 {
            flex: 1;
            margin: 0;
        }
    }

    h4 {
        margin: 1em 0 0;
    }

    button {
        border: 0;
        padding: 0;
        margin: 0;
        cursor: pointer;

        &[disabled] {
            pointer-events: none;
            opacity: .5;
        }
    }

    %close {
        position: relative;
        color: transparent;
        font-size: 0;
        overflow: hidden;
        border: 0;
        background-color: transparent;
        vertical-align: top;

        &::before {
            content: '+';
            color: #FFF;
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%) rotate(45deg);
        }
    }

    .close {
        @extend %close;
        width: 30px;
        height: 30px;
        outline: solid rgba(255, 255, 255, .5) 1px;

        &::before {
            font-size: 40px;
        }
    }

    .passage-tag {
        display: inline-block;
        padding: 2px 4px;
        border: solid rgba(255, 255, 255, .75) 1px;
        border-radius: 3px;
        margin: 2px;
    }

    .remove-tag {
        @extend %close;
        width: 16px;
        height: 16px;

        &::before {
            font-size: 20px;
        }
    }

    .add-tag-wrapper {
        margin: .5em 0;
        display: flex;
    }

    .add-tag-wrapper input {
        background-color: transparent;
        border: solid transparent 1px;
        border-bottom-color: rgba(255, 255, 255, .5);
        border-radius: 4px;
        margin-right: .5em;
        padding: 4px;
        color:  #FFF;
        flex: 1;

        &:focus {
            border-bottom-color: transparent;
            background-color: rgba(255, 255, 255, .15);
        }
    }

    .add-tag-btn {
        padding: 4px;
        border-radius: 4px;
        background-color: rgba(255, 255, 255, .15);

        :focus + & {
            background-color: #FFF;
        }
    }

    .size-options,
    .actions {
        display: grid;
        grid-template-columns: 50% 50%;
        gap: 8px;
    }

    .size-btn,
    .action {
        padding: 4px;
        border-radius: 4px;
        border: solid #FFF 1px;
        background-color: transparent;
        color: #FFF;

        &.active,
        &:hover {
            background-color: #FFF;
            color: #000;
        }
    }
</style>
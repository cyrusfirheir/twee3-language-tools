<template>
    <div class="sidebar-outer" v-if="passage">
        <header class="titlebar">
            <h3>{{ passage.name }}</h3>
            <button class="close" @click="selectPassage(null)">Close</button>
        </header>
        
        <h4>Path</h4>
        <code class="block">
            {{ passage.origin.path }}
        </code>

        <h4>Links</h4>
        <table class="linksTable" v-if="passage.linkedFrom.length || passage.linksTo.length">
            <thead>
                <tr>
                    <th>Linked from</th>
                    <th>Links to</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(x, n) in Math.max(passage.linkedFrom.length, passage.linksTo.length)" :key="`linksTable-row-${n}`">
                    <td>
                        <a v-if="passage.linkedFrom.length > n" href="#" @click.prevent="selectPassage(passage.linkedFrom[n])">
                            {{ passage.linkedFrom[n].name }}
                        </a>
                    </td>
                    <td>
                        <a v-if="passage.linksTo.length > n" href="#" @click.prevent="selectPassage(passage.linksTo[n])">
                            {{ passage.linksTo[n].name }}
                        </a>
                    </td>
                </tr>
            </tbody>
        </table>
        <span v-if="!passage.linksTo.length && !passage.linkedFrom.length">No links</span>

        <h4>Tags</h4>
        <div class="passage-tags">
            <div v-for="tag in passage.tags" :key="`passage-tag-${tag}`" class="passage-tag">
                <span class="tag-color" v-if="tagColors[tag]" :style="{ backgroundColor: tagColors[tag] }"></span>
                {{ tag }} <button class="remove-tag" @click="removeTag(tag)">Remove</button>
            </div>
            <div class="add-tag-wrapper">
                <input
                    type="text"
                    v-model="addTagModel"
                    placeholder="Add tag"
                    @keydown.enter.prevent="addTag(activeTagSuggestion || addTagModel)"
                    @keydown.esc.prevent="clearSuggestions()"
                    @keydown.down.prevent="nextSuggestion()"
                    @keydown.up.prevent="prevSuggestion()"
                    @input="updateSuggestions()"
                    @blur="clearSuggestions()"
                >
                <button class="add-tag-btn" @click="addTag(addTagModel)">Add tag</button>
            </div>
        </div>
        <div class="tag-suggestion-list" v-if="tagSuggestions && tagSuggestions.length">
            <div
                v-for="suggestion in tagSuggestions"
                :key="`tag-suggestion-${suggestion}`"
                class="tag-suggestion"
                :class="{ active: activeTagSuggestion === suggestion }"
                @mousedown="addTag(suggestion)"
            >
                {{ suggestion }}
                <span class="suggestion-color" v-if="tagColors[suggestion]" :style="{ backgroundColor: tagColors[suggestion] }"></span>
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
            <button class="action" :disabled="!hasMoved" @click="resetPosition()">Reset position</button>
            <button class="action" :disabled="!hasResized" @click="resetSize()">Reset size</button>
            <button class="action" :disabled="!hasChangedTags" @click="resetTags()">Reset tags</button>
            <button class="action" disabled>Move to file</button>
            <button class="action" disabled>Hide</button>
            <button class="action" @click="openInVsCode()">Open in VSCode</button>
        </div>
    </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from "vue-property-decorator";
import { LinkedPassage, Vector } from "../types";

@Component
export default class Sidebar extends Vue {
    @Prop() passage!: LinkedPassage;
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

    get hasMoved() {
        return this.passage.position.x !== this.passage.originalPosition.x || this.passage.position.y !== this.passage.originalPosition.y;
    }

    get hasResized() {
        return this.passage.size.x !== this.passage.originalSize.x || this.passage.size.y !== this.passage.originalSize.y;
    }

    get hasChangedTags() {
        if (!this.passage) return false;
        if (this.passage.tags.length !== this.passage.originalTags.length) return true;
        if (this.passage.tags.some((tag, index) => tag !== this.passage.originalTags[index])) return true;
        return false;
    }

    selectPassage(name: string) {
        this.$emit('selectPassage', name);
    }

    clearSuggestions() {
        this.activeTagSuggestion = '';
        this.tagSuggestions = [];
    }

    updateSuggestions() {
        if (!this.addTagModel) {
            this.tagSuggestions = [];
        } else {
            this.tagSuggestions = this.allTags.filter((tag) => tag.startsWith(this.addTagModel));
        }
    }

    nextSuggestion() {
        // If there is nothing to suggest, there is no next
        if (!this.tagSuggestions || this.tagSuggestions.length === 0) {
            this.activeTagSuggestion = '';
            if (!this.addTagModel) {
                this.tagSuggestions = this.allTags.slice();
            }
            return;
        }

        const index = this.tagSuggestions?.indexOf(this.activeTagSuggestion);
        // Clear it is not in suggestions
        if (index === undefined || index === -1) {
            this.activeTagSuggestion = '';
        }
        // If no active suggestion, take the first
        if (!this.activeTagSuggestion) {
            this.activeTagSuggestion = this.tagSuggestions[0];
        } else {
            // Else take the next
            this.activeTagSuggestion = this.tagSuggestions[(index + 1) % this.tagSuggestions.length];
        }
    }

    prevSuggestion() {
        // If there is nothing to suggest, there is no next
        if (!this.tagSuggestions || this.tagSuggestions.length === 0) {
            this.activeTagSuggestion = '';
            return;
        }

        const index = this.tagSuggestions?.indexOf(this.activeTagSuggestion);
        // Clear it is not in suggestions
        if (index === undefined || index === -1) {
            this.activeTagSuggestion = '';
        }
        // If no active suggestion, take the first
        if (!this.activeTagSuggestion) {
            this.activeTagSuggestion = this.tagSuggestions[this.tagSuggestions.length - 1];
        } else {
            // Else take the previous
            this.activeTagSuggestion = this.tagSuggestions[(index + this.tagSuggestions.length - 1) % this.tagSuggestions.length];
        }
    }

    addTag(tag: string) {
        this.addTagModel = '';
        this.clearSuggestions();
        this.$emit('addTag', tag);
    }

    removeTag(tag: string) {
        this.$emit('removeTag', tag);
    }

    setSize(size: Vector) {
        this.$emit('setSize', size);
    }

    isSize(size: Vector) {
        return this.passage && this.passage.size.x === size.x && this.passage.size.y === size.y;
    }

    resetPosition() {
        this.$emit('resetPosition');
    }

    resetSize() {
        this.$emit('resetSize');
    }

    resetTags() {
        this.$emit('resetTags');
    }

    openInVsCode() {
        this.$emit('openInVsCode');
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

    .linksTable {
        min-width: 80%;
        font-size: 14px;

        th {
            text-align: left;
            font-weight: normal;
            text-decoration: underline;
        }

        a {
            display: block;
            text-decoration: none;
            color: rgba(255, 255, 255, .75);
            font-size: 12px;
            line-height: 1.35;

            &:hover {
                color: #FFF;
                text-decoration: underline;
            }
        }
    }

    .passage-tags {
        display: flex;
        gap: .2em;
        flex-wrap: wrap;
    }

    .passage-tag {
        display: inline-flex;
        padding: 2px 4px;
        border: solid rgba(255, 255, 255, .75) 1px;
        border-radius: 3px;
        align-items: center;
        height: 25px;
        gap: .3em;
    }

    .tag-color {
        width: 8px;
        height: 12px;
        display: inline-block;
        border-radius: 2px;
    }

    .remove-tag {
        @extend %close;
        width: 24px;
        height: 23px;
        margin-right: -4px;
        transition: background-color .1s ease-in-out;
        border-left: solid rgba(255, 255, 255, .5) 1px;

        &::before {
            color: rgba(255, 255, 255, .5);
            font-size: 20px;
            transition: color .1s ease-in-out;
        }

        &:hover {
            background-color: #FFF;

            &::before {
                color: #000;
            }
        }
    }

    .add-tag-wrapper {
        display: inline-flex;
        border: solid #FFF 1px;
        border-radius: 3px;
        height: 25px;
    }

    .add-tag-wrapper input {
        background-color: transparent;
        border: solid transparent 1px;
        border-bottom-color: rgba(255, 255, 255, .5);
        border-radius: 4px;
        margin-right: .5em;
        padding: 2px 4px;
        color:  #FFF;
        width: 100px;
        outline: 0;

        &:focus {
            background-color: rgba(255, 255, 255, .15);
        }
    }

    .add-tag-btn {
        position: relative;
        padding: 4px;
        background-color: transparent;
        border-left: solid rgba(255, 255, 255, .35) 1px;
        color: transparent;
        font-size: 0;
        overflow: hidden;
        text-indent: -100vw;
        width: 25px;

        &::before {
            display: block;
            content: '+';
            position: absolute;
            font-size: 20px;
            color: rgba(255, 255, 255, .5);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-indent: 0;
        }


        :focus + &,
        &:hover {
            background-color: #FFF;

            &::before {
                color: #000;
            }
        }
    }

    .tag-suggestion-list {
        position: absolute;
        width: 96%;
        left: 2%;
        z-index: 1;
        background-color: #000;
        border: solid #FFF 2px;
        border-radius: 4px;
        padding: 5px;
        margin-top: 5px;
    }

    .tag-suggestion {
        display: grid;
        position: relative;
        line-height: 1.4em;
        grid-template-columns: 1fr auto;

        &.active {
            margin: 0 -5px;
            padding: 0 5px;
            background-color: #FFF;
            color: #000;
        }

        &:hover {
            margin: 0 -5px;
            padding: 0 5px;
            background-color: rgba(255, 255, 255, .7);
            color: #000;
        }

        .suggestion-color {
            align-self: center;
            width: 10px;
            height: 10px;
            border: solid #000 1px;
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
<template>
    <div class="sidebar-outer" v-if="passages.length">
        <header class="titlebar">
            <div class="passages">
                <template v-if="passages.length <= 3">
                    <div class="passage-head" v-for="passage in passages" :key="`passage-head-${passage.key}`">
                        <h3>{{ passage.name }}</h3>
                        <code class="block">{{ passage.origin.path }}</code>
                    </div>
                </template>
                <template v-else>
                    <div class="passage-head">
                        <h3>{{ passages.length }} Passages</h3>
                    </div>
                </template>
            </div>
            <button class="close" @click="selectPassage(null)">Close</button>
        </header>
        
        <h4>Links</h4>
        <div class="linksTableContainer" v-if="passage.linkedFrom.length || passage.linksTo.length" :style="{ maxHeight: linksContainerHeight }">
            <table class="linksTable" ref="linksTable">
                <thead>
                    <tr>
                        <th>Linked from</th>
                        <th>Links to</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(x, n) in Math.max(linkedFrom.length, linksTo.length)" :key="`linksTable-row-${n}`">
                        <td>
                            <a v-if="linkedFrom.length > n" href="#" @click.prevent="selectPassage(linkedFrom[n].passage)">
                                {{ linkedFrom[n].passage.name }}
                            </a>
                        </td>
                        <td>
                            <a v-if="linksTo.length > n" href="#" @click.prevent="selectPassage(linksTo[n].passage)">
                                {{ linksTo[n].passage.name }}
                            </a>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <span v-else>No links</span>

        <h4>Tags</h4>
        <div class="passage-tags">
            <div v-for="tag in tags" :key="`passage-tag-${tag.name}`" class="passage-tag" :class="[ tag.partial ? 'tag-all' : 'tag-some' ]">
                <span class="tag-color" v-if="tagColors[tag.name]" :style="{ backgroundColor: tagColors[tag.name] }"></span>
                {{ tag.name }} <button class="remove-tag" @click="removeTag(tag.name)">Remove</button>
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
                :key="`size-option-${sizeOption.size.x}x${sizeOption.size.y}`"
                class="size-btn"
                :class="sizeOption.class"
                @click="setSize(sizeOption.size)"
            >
                {{ sizeOption.size.x }} &times; {{ sizeOption.size.y }}
            </button>
        </div>

        <h4>Actions</h4>
        <div class="actions">
            <button class="action" :disabled="!hasMoved" @click="resetPosition()">Reset position</button>
            <button class="action" :disabled="!hasResized" @click="resetSize()">Reset size</button>
            <button class="action" :disabled="!hasChangedTags" @click="resetTags()">Reset tags</button>
            <button class="action" @click="moveToFile()">Move to file</button>
            <button class="action" disabled>Hide</button>
            <button class="action" @click="openInVsCode()">Open in VSCode</button>
        </div>
    </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from "vue-property-decorator";
import { LinkedPassage, Passage, Vector } from "../types";
import { showSaveDialog } from '../SaveToFileDialog/save-dialog';

interface TagInfo {
    name: string;
    partial: boolean;
    count: number;
}

interface LinkInfo {
    passage: Passage;
    count: number;
}

interface SizeOption {
    size: Vector;
    class: string;
}

@Component
export default class Sidebar extends Vue {
    @Prop({ default: () => []}) passages!: LinkedPassage[];
    @Prop({ default: () => []}) allTags!: string[];
    @Prop({ default: () => ({})}) tagColors!: { [tag: string]: string };

    linksContainerHeight = 'autp';
    tagSuggestions: string[] | null = null;
    activeTagSuggestion = '';
    addTagModel = '';

    get passage(): LinkedPassage {
        return this.passages[0];
    }

    get tags(): TagInfo[] {
        // Count all the tags from all selected passages
        const tagCount: { [tag: string]: number } = {};
        for (const passage of this.passages) {
            for (const tag of passage.tags) {
                if (!tagCount[tag]) tagCount[tag] = 0;
                tagCount[tag]++;
            }
        }
        // Sort tags by count and alphabet
        const sortedTags = Object.keys(tagCount).sort((tagA, tagB) => {
            const diff = tagCount[tagB] - tagCount[tagA];
            return (diff === 0) ? tagA.toLowerCase().localeCompare(tagB.toLowerCase()) : diff;
        });
        // Compile it all
        return sortedTags.map((tag): TagInfo => ({
            name: tag,
            partial: tagCount[tag] === this.passages.length,
            count: tagCount[tag],
        }));
    }

    get linkedFrom(): LinkInfo[] {
        // Count all the linkedFrom from all selected passages
        const linkCount: { [passageName: string]: { count: number, passage: Passage} } = {};
        for (const passage of this.passages) {
            for (const linkedPassage of passage.linkedFrom) {
                if (!linkCount[linkedPassage.name]) linkCount[linkedPassage.name] = { count: 0, passage: linkedPassage };
                linkCount[linkedPassage.name].count++;
            }
        }
        // Sort passages by count and alphabet
        const sortedPassageNames = Object.keys(linkCount).sort((passageA, passageB) => {
            const diff = linkCount[passageB].count - linkCount[passageA].count;
            return (diff === 0) ? linkCount[passageA].passage.name.toLowerCase().localeCompare(linkCount[passageB].passage.name.toLowerCase()) : diff;
        });
        // Compile it all
        return sortedPassageNames.map((passageName): LinkInfo => ({
            passage: linkCount[passageName].passage,
            count: linkCount[passageName].count,
        }));
    }

    get linksTo(): LinkInfo[] {
        // Count all the linksTo from all selected passages
        const linkCount: { [passageName: string]: { count: number, passage: Passage} } = {};
        for (const passage of this.passages) {
            for (const linkedPassage of passage.linksTo) {
                if (!linkCount[linkedPassage.name]) linkCount[linkedPassage.name] = { count: 0, passage: linkedPassage };
                linkCount[linkedPassage.name].count++;
            }
        }
        // Sort passages by count and alphabet
        const sortedPassageNames = Object.keys(linkCount).sort((passageA, passageB) => {
            const diff = linkCount[passageB].count - linkCount[passageA].count;
            return (diff === 0) ? linkCount[passageA].passage.name.toLowerCase().localeCompare(linkCount[passageB].passage.name.toLowerCase()) : diff;
        });
        // Compile it all
        return sortedPassageNames.map((passageName): LinkInfo => ({
            passage: linkCount[passageName].passage,
            count: linkCount[passageName].count,
        }));
    }

    get sizeOptions(): SizeOption[] {
        const passages = this.passages || [];
        const sizes = [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
            { x: 100, y: 200 },
            { x: 200, y: 200 },
        ];

        return sizes.map((size): SizeOption => ({
            size,
            class:
                passages.every((passage) => this.isSize(passage, size)) ? 'size-every' :
                passages.some((passage) => this.isSize(passage, size)) ? 'size-some' : '',
        }));
    }

    get hasMoved() {
        return this.passages.some((passage) => {
            return passage.position.x !== passage.originalPosition.x || passage.position.y !== passage.originalPosition.y;
        });
    }

    get hasResized() {
        return this.passages.some((passage) => {
            return passage.size.x !== passage.originalSize.x || passage.size.y !== passage.originalSize.y;
        });
    }

    get hasChangedTags() {
        return this.passages.some((passage) => {
            if (passage.tags.length !== passage.originalTags.length) return true;
            if (passage.tags.some((tag, index) => tag !== passage.originalTags[index])) return true;
            return false;
        });
    }

    mounted() {
        this.updatePassageContainerHeight();
    }

    @Watch('passages')
    async updatePassageContainerHeight() {
        await this.$nextTick();
        const table = this.getLinksTable();
        if (!table) {
            this.linksContainerHeight = 'auto';
        } else {
            this.linksContainerHeight = (table.getBoundingClientRect().height + 15) + 'px';
        }
    }

    getLinksTable(): HTMLTableElement {
        return this.$refs.linksTable as HTMLTableElement;
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

    isSize(passage: Passage, size: Vector) {
        return passage.size.x === size.x && passage.size.y === size.y;
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

    async moveToFile() {
        const result = await showSaveDialog();
        if (result) {
            this.$emit('moveToFile', result);
        }
    }
}

</script>

<style lang="scss" scoped>
    .sidebar-outer {
        height: 100%;
        width: 450px;
        overflow: auto;
        color: #FFF;
        padding: 20px;
        position: relative;

        &::-webkit-scrollbar {
            width: 5px;
            height: 8px;
            background-color: transparent;
        }

        &::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0);
        }

        &:hover::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, .2);
        }        
    }

    .titlebar {
        display: flex;
        align-items: flex-start;
        
        h3 {
            flex: 1;
            margin: 0;
        }

        .passages {
            flex: 1;
            padding-top: 4px;
        }

        code {
            display: block;
            margin-bottom: 8px;
            font-size: 11px;
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

    .linksTableContainer {
        position: relative;
        padding-bottom: 15px;
        overflow: hidden;
        transition: max-height .2s ease-in-out;

        &::before {
            content: '';
            display: block;
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 15px;
            background: linear-gradient(transparent, rgb(16, 22, 25));
            transition: opacity .2s ease-in-out;
        }

        &:not(:hover) {
            max-height: 10em !important;
        }
        &:hover {
            max-height: none;

            &::before {
                opacity: 0;
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

        &.size-some {
            background-color: rgba(255, 255, 255, .5);
            color: #000;
        }

        &.size-every,
        &:hover {
            background-color: #FFF;
            color: #000;
        }
    }
</style>
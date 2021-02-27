<template>
    <div class="collapsible" ref="Collapsible" :style="{ height: collapsibleHeight }">
        <div ref="HeightWrapper">
            <slot />
        </div>
    </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from "vue-property-decorator";

@Component
export default class Collapsible extends Vue {
    @Prop() collapsed: boolean;
    collapsibleHeight = 'auto';
    animationTimeout = 0;

    heightWrapper(): HTMLDivElement {
        return this.$refs.HeightWrapper as HTMLDivElement;
    }

    collapsible(): HTMLDivElement {
        return this.$refs.Collapsible as HTMLDivElement;
    }

    getContentHeight(): string {
        let height = (this.animationTimeout)
            ? this.collapsible().getBoundingClientRect().height
            : this.heightWrapper().getBoundingClientRect().height
            ?? this.heightWrapper().getBoundingClientRect().height;
        return `${height}px`;
    }

    @Watch('collapsed')
    async updateCollapsed() {
        // Cancel any "return to auto" timeouts
        window.clearTimeout(this.animationTimeout);

        if (this.collapsed) {
            // from open to 0, first set the height to current height
            // then set to 0 in the next frame
            this.collapsibleHeight = this.getContentHeight();
            setTimeout(() => { this.collapsibleHeight = '0px'; });
        } else {
            this.collapsibleHeight = this.getContentHeight();
            this.animationTimeout = window.setTimeout(() => {
                this.collapsibleHeight = 'auto';
                this.animationTimeout = 0;
            }, 200);
        }
    }

    created() {
        if (this.collapsed) {
            this.collapsibleHeight = '0px';
        }
    }
}
</script>

<style lang="scss" scoped>
.collapsible {
    overflow: hidden;
    transition: height .2s ease-in-out;
}
</style>
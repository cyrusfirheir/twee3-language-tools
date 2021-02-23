import Vue from 'vue'
import SaveToFile from './SaveToFile.vue'

export const showSaveDialog = () => {
    return new Promise<string | void>((resolve, reject) => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const app = new Vue({ render: (h) => h(SaveToFile) }).$mount(el);
        const appComponent = app.$children[0] as SaveToFile;

        const complete = (result: string | void) => {
            app.$destroy();
            resolve(result);
        };

        appComponent.$on('save', complete);
        appComponent.$on('cancel', complete);
    });
};

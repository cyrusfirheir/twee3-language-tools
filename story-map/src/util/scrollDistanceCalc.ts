// We dont expect this value to change during use (it would require changing firefox settings)
const rootLineheight = ((): number => {
    const iframe = document.createElement('iframe');
    iframe.src = '#';
    document.body.appendChild(iframe);
    const innerWindow = iframe.contentWindow as Window;
    const innerDocument = innerWindow.document;
    innerDocument.open();
    innerDocument.write('<!DOCTYPE html><html><head></head><body><span>a</span></body></html>');
    innerDocument.close();
    const span = innerDocument.body.firstElementChild as HTMLElement;
    const rootLineheight = span.offsetHeight;
    document.body.removeChild(iframe);
    return rootLineheight;
})();

export const getScrollDistance = (event: WheelEvent): number => {
    switch (event.deltaMode) {
        case WheelEvent.DOM_DELTA_PIXEL:
            return event.deltaY;
        case WheelEvent.DOM_DELTA_LINE:
            return event.deltaY * rootLineheight;
        default:
            return 100;
    }
}
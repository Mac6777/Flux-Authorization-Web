/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-env browser */

/**
 * Script injected by the VS Code Live Preview Extension.
 * http://aka.ms/live-preview
 */

type MessageCommand = {
    command: string;
    text?: string;
};

type ConsoleMessagePayload = {
    type: string;
    data: string;
};

window.addEventListener('message', (event) => handleMessage(event), false);
window.addEventListener('error', (event) => handleError(event), false);

document.addEventListener('DOMContentLoaded', () => {
    onLoad();
});

if (window.parent !== window) {
    console.error = createConsoleOverride('ERROR');
    console.log = createConsoleOverride('LOG');
    console.warn = createConsoleOverride('WARN');
    console.info = createConsoleOverride('INFO');
    console.clear = createConsoleOverride('CLEAR');
}

function onLoad(): void {
    const connection = new WebSocket('ws://127.0.0.1:3001/b50939004dd472d1ae1f4ddf33fe1afad5d10c9f');
    connection.addEventListener('message', (e) => handleSocketMessage(e.data));

    let onlyCtrlDown = false;

    const commandPayload = {
        path: window.location.href,
        title: document.title,
    };

    postParentMessage({
        command: 'update-path',
        text: JSON.stringify(commandPayload),
    });

    handleLinkHoverEnd();

    const links = document.getElementsByTagName('a');
    Array.from(links).forEach((link) => {
        link.addEventListener('click', (e) => handleLinkClick((e.target as HTMLAnchorElement).href));
        link.addEventListener('mouseenter', (e) => handleLinkHoverStart((e.target as HTMLAnchorElement).href));
        link.addEventListener('mouseleave', () => handleLinkHoverEnd());
    });

    document.addEventListener('keydown', (e) => {
        onlyCtrlDown = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
        if ((e.key === 'F' || e.key === 'f') && onlyCtrlDown) {
            postParentMessage({
                command: 'show-find',
            });
            return;
        }
        postParentMessage({
            command: 'did-keydown',
            key: extractKeyEventData(e),
        });
    });

    document.addEventListener('keyup', (e) => {
        onlyCtrlDown = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
        postParentMessage({
            command: 'did-keyup',
            key: extractKeyEventData(e),
        });
    });
}

function createConsoleOverride(type: string): (...args: unknown[]) => void {
    const consoleOverrides: Record<string, (...args: unknown[]) => void> = {
        ERROR: console.error,
        LOG: console.log,
        WARN: console.warn,
        INFO: console.info,
        CLEAR: console.clear,
    };

    return function (...args: unknown[]) {
        let stringifiedMsg = 'undefined';

        try {
            stringifiedMsg = JSON.stringify(args);
            if (!stringifiedMsg) throw new Error('Message is not in JSON format');
        } catch {
            try {
                stringifiedMsg = args.toString();
            } catch {
                // noop
            }
        }

        const messagePayload: ConsoleMessagePayload = {
            type,
            data: stringifiedMsg,
        };
        postParentMessage({
            command: 'console',
            text: JSON.stringify(messagePayload),
        });
        consoleOverrides[type].apply(console, args);
    };
}

function handleSocketMessage(data: string): void {
    const parsedMessage = JSON.parse(data);
    switch (parsedMessage.command) {
        case 'reload':
            reloadPage();
            break;
    }
}

function handleMessage(event: MessageEvent): void {
    const message = event.data as MessageCommand;

    switch (message.command) {
        case 'refresh':
            reloadPage();
            break;
        case 'refresh-forced':
            window.location.reload();
            break;
        case 'setup-parent-listener':
            const commandPayload = {
                path: window.location.href,
                title: document.title,
            };
            postParentMessage({
                command: 'update-path',
                text: JSON.stringify(commandPayload),
            });
            break;
        case 'find-next':
            handleFindCommand(message.text, false);
            break;
        case 'find-prev':
            handleFindCommand(message.text, true);
            break;
        default:
            if (message.command !== 'perform-url-check' && message.command !== 'update-path') {
                postParentMessage(message);
            }
    }
}

function handleError(event: ErrorEvent): void {
    const stackMessage = event.error?.stack || '';
    const errorType = stackMessage.split(':')[0];

    if (errorType === 'Error') {
        const messagePayload: ConsoleMessagePayload = {
            type: 'UNCAUGHT_ERROR',
            data: stackMessage,
        };
        postParentMessage({
            command: 'console',
            text: JSON.stringify(messagePayload),
        });
    }
}

function hasFindResults(searchString: string): boolean {
    window.getSelection()?.removeAllRanges();
    const canGoForward = window.find(searchString);
    const canGoBack = window.find(searchString, false, true);
    return canGoForward || canGoBack;
}

function findToBeginning(searchString: string): void {
    window.getSelection()?.removeAllRanges();
    window.find(searchString);
}

function findToEnd(searchString: string): void {
    window.getSelection()?.removeAllRanges();
    window.find(searchString, false, true);
}

function postParentMessage(data: MessageCommand): void {
    if (window.parent !== window) {
        window.parent.postMessage(data, '*');
    }
}

function handleLinkClick(linkTarget: string): void {
    const host = 'http://127.0.0.1:3000';
    if (linkTarget && !linkTarget.startsWith('javascript:')) {
        if (!linkTarget.startsWith(host)) {
            postParentMessage({ command: 'open-external-link', text: linkTarget });
        } else {
            postParentMessage({ command: 'perform-url-check', text: linkTarget });
        }
    }
}

function handleLinkHoverStart(linkTarget: string): void {
    postParentMessage({ command: 'link-hover-start', text: linkTarget });
}

function handleLinkHoverEnd(): void {
    postParentMessage({ command: 'link-hover-end' });
}

function reloadPage(): void {
    const block = document.body?.hasAttribute('data-server-no-reload') ?? false;
    if (!block) {
        window.location.reload();
    }
}

function extractKeyEventData(e: KeyboardEvent) {
    return {
        key: e.key,
        keyCode: e.keyCode,
        code: e.code,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        repeat: e.repeat,
    };
}

function handleFindCommand(searchText?: string, reverse = false): void {
    if (!searchText) return;

    let findResult = window.find(searchText, false, reverse);
    if (!findResult) {
        if (reverse) {
            findToEnd(searchText);
        } else {
            findToBeginning(searchText);
        }
        findResult = true;
    }
    postParentMessage({
        command: 'show-find-icon',
        text: findResult.toString(),
    });
}

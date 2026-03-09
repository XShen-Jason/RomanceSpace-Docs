import { defineConfig } from 'rspress/config';

export default defineConfig({
    root: 'public',
    title: 'RomanceSpace Docs',
    description: 'RomanceSpace 开发与架构文档',
    icon: '/rspress-icon.png',
    logo: {
        light: '/rspress-light-logo.png',
        dark: '/rspress-dark-logo.png',
    },
    themeConfig: {
        socialLinks: [
            { icon: 'github', mode: 'link', content: 'https://github.com/XShen-Jason/RomanceSpace-Docs' },
        ],
        sidebar: {
            '/': [
                {
                    text: '概述',
                    items: [
                        { text: '项目介绍', link: '/index' },
                        { text: '核心架构指南', link: '/architecture-guide' },
                    ],
                },
                {
                    text: '开发者支持',
                    items: [
                        { text: 'API 接口集成文档', link: '/api-reference' },
                        { text: 'Schema 配置规范', link: '/schema-specification' },
                    ],
                },
            ],
        },
    },
});

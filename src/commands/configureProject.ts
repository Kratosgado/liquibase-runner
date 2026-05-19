import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import { getProjectOverrides } from '../config/configManager.js';

export function createConfigureProjectCommand( projects: LiquibaseProject[] ) {
    return async () => {
        if ( projects.length === 0 ) {
            vscode.window.showWarningMessage( 'No Liquibase projects detected in this workspace.' );
            return;
        }

        const picked = await vscode.window.showQuickPick(
            projects.map( p => ( { label: p.name, description: p.rootPath, project: p } ) ),
            { placeHolder: 'Select project to configure' },
        );
        if ( !picked ) return;

        const project = picked.project;
        const root = project.rootPath;
        const current = getProjectOverrides( root ) ?? {};

        const changelog = await vscode.window.showInputBox( {
            prompt: 'Changelog file (relative to project root)',
            value: current.changelogFile ?? project.changelogFile,
        } );
        if ( changelog === undefined ) return;

        const propertiesFile = await vscode.window.showInputBox( {
            prompt: 'Properties file (relative to project root)',
            value: current.propertiesFile ?? project.propertiesFile,
        } );
        if ( propertiesFile === undefined ) return;

        const strategy = await vscode.window.showQuickPick( [
            { label: 'auto' },
            { label: 'maven' },
            { label: 'gradle' },
            { label: 'cli' },
        ].map( i => ( { label: i.label, picked: i.label === ( current.resolvedStrategy ?? project.resolvedStrategy ) } ) ),
            { placeHolder: 'Execution strategy (overrides workspace setting)' } );
        if ( !strategy ) return;

        const cfg = vscode.workspace.getConfiguration( 'liquibaseRunner' );
        const all = cfg.get<Record<string, Partial<LiquibaseProject>>>( 'projectOverrides', {} );
        all[ root ] = {
            changelogFile: changelog,
            propertiesFile: propertiesFile,
            resolvedStrategy: strategy.label as any,
        };
        await cfg.update( 'projectOverrides', all, vscode.ConfigurationTarget.Workspace );
        vscode.window.showInformationMessage( `Saved Liquibase overrides for ${project.name}` );
    };
}

import * as assert from 'assert';
import * as vscode from 'vscode';
import { tabInputUri } from '../../../common/utils/tabUtils';

suite('tabInputUri', () => {
  test('does not throw when input is missing', () => {
    assert.strictEqual(tabInputUri(undefined), undefined);
    assert.strictEqual(tabInputUri(null), undefined);
    assert.strictEqual(tabInputUri({}), undefined);
  });

  test('returns undefined for tab inputs without a text URI', () => {
    assert.strictEqual(tabInputUri({ viewType: 'webview' }), undefined);
    assert.strictEqual(tabInputUri({ uri: 'untitled:Untitled-1' }), undefined);
  });

  test('returns the URI from a text tab input', () => {
    const uri = vscode.Uri.parse('untitled:Untitled-1');
    assert.strictEqual(tabInputUri({ uri })?.toString(), uri.toString());
  });
});

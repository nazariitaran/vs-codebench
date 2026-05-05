import * as assert from 'assert';
import ScratchpadValidator from '../../features/scratchpads/ScratchpadValidator';

suite('ScratchpadValidator', () => {
  suite('validateFolderName', () => {
    test('returns null for valid folder name', () => {
      assert.strictEqual(ScratchpadValidator.validateFolderName('My Folder'), null);
      assert.strictEqual(ScratchpadValidator.validateFolderName('work'), null);
      assert.strictEqual(ScratchpadValidator.validateFolderName('a'), null);
      assert.strictEqual(ScratchpadValidator.validateFolderName('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_- .'), null);
    });

    test('returns error for empty string', () => {
      assert.strictEqual(ScratchpadValidator.validateFolderName(''), 'Folder name cannot be empty.');
      assert.strictEqual(ScratchpadValidator.validateFolderName('   '), 'Folder name cannot be empty.');
    });

    test('returns error for name exceeding 75 characters', () => {
      const longName = 'a'.repeat(76);
      assert.strictEqual(
        ScratchpadValidator.validateFolderName(longName),
        'Folder name must be no more than 75 characters.'
      );
    });

    test('returns null for name at exactly 75 characters', () => {
      const maxName = 'a'.repeat(75);
      assert.strictEqual(ScratchpadValidator.validateFolderName(maxName), null);
    });

    test('returns error for invalid characters', () => {
      assert.strictEqual(
        ScratchpadValidator.validateFolderName('folder@name'),
        'Folder name contains invalid characters.'
      );
      assert.strictEqual(
        ScratchpadValidator.validateFolderName('folder/name'),
        'Folder name contains invalid characters.'
      );
      assert.strictEqual(
        ScratchpadValidator.validateFolderName('folder\\name'),
        'Folder name contains invalid characters.'
      );
      assert.strictEqual(
        ScratchpadValidator.validateFolderName('folder:name'),
        'Folder name contains invalid characters.'
      );
    });

    test('allows valid special characters: dash, underscore, space, dot, hyphen', () => {
      assert.strictEqual(ScratchpadValidator.validateFolderName('my-folder'), null);
      assert.strictEqual(ScratchpadValidator.validateFolderName('my_folder'), null);
      assert.strictEqual(ScratchpadValidator.validateFolderName('my folder'), null);
      assert.strictEqual(ScratchpadValidator.validateFolderName('my.folder'), null);
      assert.strictEqual(ScratchpadValidator.validateFolderName('my folder-2024_v1.0'), null);
    });

    test('trims whitespace before validation', () => {
      assert.strictEqual(ScratchpadValidator.validateFolderName('  my folder  '), null);
    });
  });

  suite('validateTotalCount', () => {
    test('returns null when under limit', () => {
      const files = Array.from({ length: 100 }, (_, i) => ({ id: `file-${i}` }));
      assert.strictEqual(ScratchpadValidator.validateTotalCount(files), null);
    });

    test('returns null when at exactly 199 files', () => {
      const files = Array.from({ length: 199 }, (_, i) => ({ id: `file-${i}` }));
      assert.strictEqual(ScratchpadValidator.validateTotalCount(files), null);
    });

    test('returns error when at 200 files (limit reached)', () => {
      const files = Array.from({ length: 200 }, (_, i) => ({ id: `file-${i}` }));
      assert.strictEqual(
        ScratchpadValidator.validateTotalCount(files),
        'Maximum of 200 scratchpads reached.'
      );
    });

    test('returns error when over limit', () => {
      const files = Array.from({ length: 201 }, (_, i) => ({ id: `file-${i}` }));
      assert.strictEqual(
        ScratchpadValidator.validateTotalCount(files),
        'Maximum of 200 scratchpads reached.'
      );
    });
  });

  suite('validateFileName', () => {
    test('returns null for valid file name', () => {
      assert.strictEqual(ScratchpadValidator.validateFileName('file.txt'), null);
      assert.strictEqual(ScratchpadValidator.validateFileName('my file.js'), null);
    });

    test('returns error for empty string', () => {
      assert.strictEqual(ScratchpadValidator.validateFileName(''), 'File name cannot be empty.');
      assert.strictEqual(ScratchpadValidator.validateFileName('   '), 'File name cannot be empty.');
    });

    test('returns error for name exceeding 75 characters', () => {
      const longName = 'a'.repeat(76);
      assert.strictEqual(
        ScratchpadValidator.validateFileName(longName),
        'File name must be no more than 75 characters.'
      );
    });

    test('returns error for invalid characters', () => {
      assert.strictEqual(
        ScratchpadValidator.validateFileName('file@name'),
        'File name contains invalid characters.'
      );
      assert.strictEqual(
        ScratchpadValidator.validateFileName('file/name'),
        'File name contains invalid characters.'
      );
    });
  });

  suite('validateForCreate', () => {
    test('returns null when name is undefined', () => {
      assert.strictEqual(ScratchpadValidator.validateForCreate({}), null);
      assert.strictEqual(ScratchpadValidator.validateForCreate({ language: 'js' }), null);
    });

    test('validates file name when provided', () => {
      assert.strictEqual(ScratchpadValidator.validateForCreate({ name: '' }), 'File name cannot be empty.');
      assert.strictEqual(
        ScratchpadValidator.validateForCreate({ name: 'a'.repeat(76) }),
        'File name must be no more than 75 characters.'
      );
      assert.strictEqual(ScratchpadValidator.validateForCreate({ name: 'valid.js' }), null);
    });
  });
});

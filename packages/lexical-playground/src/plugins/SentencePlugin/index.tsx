import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  $createRangeSelection,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $setSelection,
  LexicalNode,
  Point,
  TextNode,
  EditorState,
  $getSelection,
  $isRangeSelection,
  $isRootNode,
  ElementNode,
} from 'lexical';

const SENTENCE = 'Roses are red.';

interface PointPath {
  rootIndex: number;
  textOffset: number;
}

const saveSelection = (anchor: PointPath, focus: PointPath) => {
  localStorage.setItem('anchor', JSON.stringify(anchor));
  localStorage.setItem('focus', JSON.stringify(focus));
};

const getSelection = () => {
  const anchor = localStorage.getItem('anchor');
  const focus = localStorage.getItem('focus');

  if (!anchor || !focus) return null;

  return {
    anchor: JSON.parse(anchor) as PointPath,
    focus: JSON.parse(focus) as PointPath,
  };
};

const saveEditorState = (editorState: EditorState) => {
  localStorage.setItem('editorState', JSON.stringify(editorState));
};

const getEditorState = () => {
  const editorState = localStorage.getItem('editorState');

  if (!editorState) return null;

  return editorState;
};

function assert(condition: boolean): asserts condition {
  if (!condition) throw new Error('Assertion failed');
}

function assertNotNil<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Assertion failed: value is null or undefined');

  return value;
}

// Inspired by @etrepum on Lexical Discord: https://discord.com/channels/953974421008293909/1182591716713299979/1182593059632992337
function $pointToPath(point: Point): PointPath {
  let node = point.getNode();
  let textOffset = point.offset;
  let top: LexicalNode | null = null;

  function setOffsetFromNode(node: LexicalNode): void {
    if ($isTextNode(node)) setOffsetFromTextNode(node);
    else if ($isElementNode(node)) setOffsetFromElementNode(node);
  }

  function setOffsetFromTextNode(node: TextNode): void {
    textOffset += node.getTextContentSize();
  }

  function setOffsetFromElementNode(top: ElementNode): void {
    top.getAllTextNodes().forEach(setOffsetFromTextNode);
  }

  function setOffsetFromPreviousSiblings(node: LexicalNode): void {
    const parent = node.getParent();
    if (!parent || $isRootNode(parent)) {
      top = node;
      return;
    }

    node.getPreviousSiblings().forEach(setOffsetFromNode);
    setOffsetFromPreviousSiblings(parent);
  }

  setOffsetFromPreviousSiblings(node);

  if (!top) throw new Error('Expected top to be defined');

  const rootIndex = (top as LexicalNode).getIndexWithinParent();

  return {rootIndex, textOffset};
}

function findTargetNode(
  node: LexicalNode,
  textOffset: number,
): [TextNode | null, number] {
  if ($isTextNode(node)) return findTargetInTextNode(node, textOffset);
  else if ($isElementNode(node))
    return findTargetInElementNode(node, textOffset);

  return [null, textOffset];
}

function findTargetInTextNode(
  textNode: TextNode,
  textOffset: number,
): [TextNode | null, number] {
  const size = textNode.getTextContentSize();

  // We're done, we found the target node
  if (size >= textOffset) return [textNode, textOffset];

  textOffset -= size;
  return [null, textOffset];
}

function findTargetInElementNode(
  elementNode: ElementNode,
  textOffset: number,
): [TextNode | null, number] {
  const children = elementNode.getChildren();
  for (const child of children) {
    // Can't just assign to textOffset directly b/c TypeScript complains of: Block-scoped variable 'textOffset' used before its declaration.ts(2448)
    const [targetNode, updatedTextOffset] = findTargetNode(child, textOffset);
    textOffset = updatedTextOffset;
    if (targetNode) return [targetNode, textOffset];
  }

  return [null, textOffset];
}

// Inspired by @etrepum on Lexical Discord: https://discord.com/channels/953974421008293909/1182591716713299979/1182593059632992337
function $setPointFromPointPath(point: Point, path: PointPath): void {
  const root = $getRoot();
  const top = assertNotNil(root.getChildAtIndex(path.rootIndex));
  assert($isElementNode(top));

  const [targetNode, textOffset] = findTargetNode(top, path.textOffset);

  if (!targetNode) {
    // Something went wrong - targetNode shouldn't be null
    point.set(top.getKey(), 0, 'element');
  } else {
    point.set(
      targetNode.getKey(),
      Math.min(textOffset, targetNode.getTextContentSize()),
      'text',
    );
  }
}

const findFirstSentenceMatch = (rootTexts: string[], sentence: string) => {
  for (let i = 0; i < rootTexts.length; i++) {
    if (!rootTexts[i].includes(sentence)) continue;

    const startOffset = rootTexts[i].indexOf(SENTENCE);
    const endOffset = startOffset + SENTENCE.length;

    return {
      rootIndex: i,
      startOffset,
      endOffset,
    };
  }

  return null;
};

const SentencePlugin = () => {
  const [editor] = useLexicalComposerContext();

  const handlSaveEditorState = () => {
    const editorState = editor.getEditorState();
    saveEditorState(editorState);
  };

  const handlLoadEditorState = () => {
    const editorState = getEditorState();
    if (!editorState) return;

    editor.update(() => {
      editor.setEditorState(editor.parseEditorState(editorState));
    });
  };

  const handlSaveSelection = () => {
    editor.update(() => {
      const selection = $getSelection();
      if (!selection) return;

      if (!$isRangeSelection(selection)) return;

      const anchor = $pointToPath(selection.anchor);
      const focus = $pointToPath(selection.focus);

      saveSelection(anchor, focus);
    });
  };

  const handlLoadSelection = () => {
    editor.update(() => {
      const selection = $createRangeSelection();
      const selectionPaths = getSelection();
      if (!selectionPaths) return;

      $setPointFromPointPath(selection.anchor, {
        rootIndex: selectionPaths.anchor.rootIndex,
        textOffset: selectionPaths.anchor.textOffset,
      });
      $setPointFromPointPath(selection.focus, {
        rootIndex: selectionPaths.focus.rootIndex,
        textOffset: selectionPaths.focus.textOffset,
      });

      $setSelection(selection);
    });
  };

  const handleHighlight = () => {
    editor.update(() => {
      const rootNodes = $getRoot().getChildren();
      const rootTexts = rootNodes.map((node) => node.getTextContent());
      console.log('rootTexts', rootTexts);

      const sentenceMatch = findFirstSentenceMatch(rootTexts, SENTENCE);
      if (!sentenceMatch) return;

      const selection = $createRangeSelection();
      $setPointFromPointPath(selection.anchor, {
        rootIndex: sentenceMatch.rootIndex,
        textOffset: sentenceMatch.startOffset,
      });
      $setPointFromPointPath(selection.focus, {
        rootIndex: sentenceMatch.rootIndex,
        textOffset: sentenceMatch.endOffset,
      });

      $setSelection(selection);
    });
  };

  return (
    <>
      <button onClick={handlSaveEditorState}>Save EditorState</button>{' '}
      <button onClick={handlLoadEditorState}>Load EditorState</button>{' '}
      <button onClick={handlSaveSelection}>Save Selection</button>
      <button onClick={handlLoadSelection}>Load Selection</button>
      <button onClick={handleHighlight}>Highlight '{SENTENCE}'</button>
    </>
  );
};

export default SentencePlugin;

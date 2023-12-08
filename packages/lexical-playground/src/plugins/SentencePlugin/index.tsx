import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  $createRangeSelection,
  $getRoot,
  $isElementNode,
  $setSelection,
  LexicalNode,
  Point,
  TextNode,
} from 'lexical';

const SENTENCE = 'Roses are red.';

interface PointPath {
  rootIndex: number;
  textOffset: number;
}

function assert(condition: boolean): asserts condition {
  if (!condition) throw new Error('Assertion failed');
}

// Ensures that every case in a union type is handled.
function assertNever(x: never): never {
  throw new Error(`Unexpected object: ${x}`);
}

function assertNotNil<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Assertion failed: value is null or undefined');

  return value;
}

// Borrowed from @etrepum on Lexical Discord: https://discord.com/channels/953974421008293909/1182591716713299979/1182593059632992337
function $pointToPath(point: Point): PointPath {
  let node = point.getNode();
  const top = node.getTopLevelElementOrThrow();
  const rootIndex = top.getIndexWithinParent();
  let textOffset = 0;
  if (point.type === 'text') {
    textOffset += point.offset;
  } else if (point.type === 'element') {
    assert($isElementNode(node));
    node.getChildren().forEach((n, i) => {
      if (i < point.offset) {
        textOffset += n.getTextContentSize();
      }
    });
  } else {
    assertNever(point.type);
  }
  for (; !node.is(top); node = node.getParentOrThrow()) {
    node.getPreviousSiblings().forEach((n) => {
      textOffset += n.getTextContentSize();
    });
  }

  return {rootIndex, textOffset};
}

function $setPointFromPointPath(point: Point, path: PointPath): void {
  const root = $getRoot();
  const top = assertNotNil(root.getChildAtIndex(path.rootIndex));
  let {textOffset} = path;
  assert($isElementNode(top));
  let targetNode: TextNode | null = null;
  for (const node of top.getAllTextNodes()) {
    const size = node.getTextContentSize();
    targetNode = node;
    if (size < textOffset) {
      textOffset -= size;
    } else {
      break;
    }
  }

  if (!targetNode) {
    // Something went wrong

    // @ts-ignore b/c TypeScript complains that Point was exported as a type
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

// Essentially a clone of https://github.com/facebook/lexical/blob/fe940b94ef9200b8bf170715387291809a6c644b/packages/lexical/src/nodes/LexicalElementNode.ts#L247-L263
// except that we don't add DOUBLE_LINE_BREAK between block elements (e.g. table cells listitems, etc).
// This is important because $setPointFromPointPath() counts characters in text node, so we don't want extra line break characters being added between them.
const getTextContent = (rootNode: LexicalNode): string => {
  let textContent = '';

  if (!$isElementNode(rootNode)) return textContent;

  const children = rootNode.getChildren();
  const childrenLength = children.length;
  for (let i = 0; i < childrenLength; i++) {
    const child = children[i];

    // Lexical's getTextContent() adds DOUBLE_LINE_BREAK between non inline elements: https://github.com/facebook/lexical/blob/main/packages/lexical/src/nodes/LexicalElementNode.ts#L255-L257,
    // so we're not going to call the default child.getTextContent() in order to prevent that
    if ($isElementNode(child) && !child.isInline()) {
      textContent += getTextContent(child);
    } else {
      textContent += child.getTextContent();
    }
  }
  return textContent;
};

const SentencePlugin = () => {
  const [editor] = useLexicalComposerContext();

  const handleClick = () => {
    editor.update(() => {
      const rootNodes = $getRoot().getChildren();
      const rootTexts = rootNodes.map(getTextContent);
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

  return <button onClick={handleClick}>Highlight '{SENTENCE}'</button>;
};

export default SentencePlugin;

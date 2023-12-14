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
  $isLineBreakNode,
  ElementNode,
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

// https://github.com/facebook/lexical/blob/5a649b964208964d44bc6222f0fcfe3f4840f860/packages/lexical/src/LexicalConstants.ts#L80
const DOUBLE_LINE_BREAK = '\n\n';

function $setPointFromPointPath(point: Point, path: PointPath): void {
  const root = $getRoot();
  const top = assertNotNil(root.getChildAtIndex(path.rootIndex));
  assert($isElementNode(top));

  let {textOffset} = path;

  function findTargetNode(node: LexicalNode): TextNode | null {
    if ($isTextNode(node)) return findTargetInTextNode(node);
    else if ($isElementNode(node)) return findTargetInElementNode(node);
    else if ($isLineBreakNode(node)) textOffset -= 1;

    return null;
  }

  function findTargetInTextNode(textNode: TextNode): TextNode | null {
    const size = textNode.getTextContentSize();

    // We're done, we found the target node
    if (size >= textOffset) return textNode;

    textOffset -= size;
    return null;
  }

  function findTargetInElementNode(elementNode: ElementNode): TextNode | null {
    const children = elementNode.getChildren();
    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      const targetNode = findTargetNode(child);
      if (targetNode) return targetNode;

      adjustTextOffsetForElementNode(child, i, children.length);
    }

    return null;
  }

  // Lexical's getTextContent() adds DOUBLE_LINE_BREAK between non inline elements: https://github.com/facebook/lexical/blob/1a3c9114e2c58f92d22edeac2a9030ace2129f3b/packages/lexical/src/nodes/LexicalElementNode.ts#L247-L263
  // so we need to account for those extra 2 line break characters when counting textOffset.
  function adjustTextOffsetForElementNode(
    node: LexicalNode,
    index: number,
    totalChildren: number,
  ) {
    // The following if condition is borrowed from https://github.com/facebook/lexical/blob/1a3c9114e2c58f92d22edeac2a9030ace2129f3b/packages/lexical/src/nodes/LexicalElementNode.ts#L254-L260
    if (
      $isElementNode(node) &&
      index !== totalChildren - 1 &&
      !node.isInline()
    ) {
      textOffset -= DOUBLE_LINE_BREAK.length;
    }
  }

  const targetNode = findTargetNode(top);

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

  const handleClick = () => {
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

  return <button onClick={handleClick}>Highlight '{SENTENCE}'</button>;
};

export default SentencePlugin;

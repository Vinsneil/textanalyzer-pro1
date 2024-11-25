import { italianAdjectives } from './italianDictionaries/adjectives';
import { positiveWordsIT, negativeWordsIT } from './italianDictionaries/sentimentWords';
import nlp from 'compromise';

const removeStopwords = (words: string[], lang: string) => {
  const stopwords = lang === "it" 
    ? ["il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "a", "da", "in", "con", "su", "per", "tra", "fra"]
    : ["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", "by"];
  return words.filter(word => !stopwords.includes(word.toLowerCase()));
};

const getNGrams = (words: string[], n: number): Array<[string, number]> => {
  const ngrams: { [key: string]: number } = {};
  
  for (let i = 0; i <= words.length - n; i++) {
    const ngram = words.slice(i, i + n).join(" ");
    ngrams[ngram] = (ngrams[ngram] || 0) + 1;
  }
  
  return Object.entries(ngrams)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40);
};

const detectLanguage = (text: string): "it" | "en" => {
  const italianWords = ["il", "lo", "la", "i", "gli", "le", "di", "da", "in", "con"];
  const words = text.toLowerCase().split(" ");
  const italianCount = words.filter(word => italianWords.includes(word)).length;
  return italianCount > words.length * 0.1 ? "it" : "en";
};

const findProperNouns = (text: string): Array<[string, number]> => {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const properNouns: { [key: string]: number } = {};
  
  sentences.forEach(sentence => {
    const words = sentence.trim().split(/\s+/);
    words.forEach((word, index) => {
      // Skip first word of sentence and words after punctuation
      if (index === 0 || words[index - 1].endsWith('.')) return;
      
      // Check if word starts with capital letter
      if (/^[A-Z][a-zàèéìòù]*$/.test(word)) {
        properNouns[word] = (properNouns[word] || 0) + 1;
      }
    });
  });

  return Object.entries(properNouns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40);
};

const cleanWord = (word: string): string => {
  return word.replace(/[.,!?;:"']/g, '').toLowerCase().trim();
};

const getAdjectiveForms = (adjective: string): Set<string> => {
  const forms = new Set<string>();
  forms.add(adjective); // forma base

  // Regole per il plurale maschile
  if (adjective.endsWith('o')) {
    forms.add(adjective.slice(0, -1) + 'i'); // es: bello -> belli
  } else if (adjective.endsWith('e')) {
    forms.add(adjective.slice(0, -1) + 'i'); // es: grande -> grandi
  }

  // Regole per il femminile e plurale femminile
  if (adjective.endsWith('o')) {
    forms.add(adjective.slice(0, -1) + 'a'); // singolare femminile
    forms.add(adjective.slice(0, -1) + 'e'); // plurale femminile
  } else if (adjective.endsWith('e')) {
    // Per aggettivi che terminano in 'e', il femminile è uguale al maschile
    forms.add(adjective); // singolare femminile
    forms.add(adjective.slice(0, -1) + 'i'); // plurale sia maschile che femminile
  } else if (adjective.endsWith('to')) {
    forms.add(adjective.slice(0, -1) + 'ta'); // singolare femminile
    forms.add(adjective.slice(0, -2) + 'ti'); // plurale maschile
    forms.add(adjective.slice(0, -2) + 'te'); // plurale femminile
  }

  return forms;
};

const getAllAdjectiveForms = (): Set<string> => {
  const allForms = new Set<string>();
  italianAdjectives.forEach(adj => {
    const forms = getAdjectiveForms(adj);
    forms.forEach(form => allForms.add(form));
  });
  return allForms;
};

const adjectiveFormsSet = getAllAdjectiveForms();

const getAdjectiveSentiment = (adjective: string): number => {
  const cleanedAdj = cleanWord(adjective);
  
  if (positiveWordsIT.has(cleanedAdj)) {
    return 1;
  }
  if (negativeWordsIT.has(cleanedAdj)) {
    return -1.5; // Aumentato il peso negativo
  }
  
  return 0;
};

export const analyzeText = (text: string) => {
  const lang = detectLanguage(text);
  const doc = nlp(text);
  const words = text.split(/\s+/);
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const cleanWords = removeStopwords(words, lang);
  
  // Count adjectives in the text
  let adjectivesCount = 0;
  const adjectivesFreq: { [key: string]: number } = {};
  
  words.forEach(word => {
    const cleanedWord = cleanWord(word);
    if (adjectiveFormsSet.has(cleanedWord)) {
      adjectivesCount++;
      const baseForm = Array.from(italianAdjectives).find(adj => 
        getAdjectiveForms(adj).has(cleanedWord)
      ) || cleanedWord;
      
      adjectivesFreq[baseForm] = (adjectivesFreq[baseForm] || 0) + 1;
    }
  });
  
  const sentimentResults = sentences.map(sentence => {
    const words = sentence.toLowerCase().split(/\s+/);
    let score = 0;
    let totalWords = 0;
    
    words.forEach(word => {
      const cleanedWord = cleanWord(word);
      
      if (positiveWordsIT.has(cleanedWord)) {
        score += 1;
        totalWords += 1;
      }
      if (negativeWordsIT.has(cleanedWord)) {
        score -= 1.5; // Aumentato il peso negativo
        totalWords += 1;
      }
      
      if (adjectiveFormsSet.has(cleanedWord)) {
        const adjectiveSentiment = getAdjectiveSentiment(cleanedWord);
        if (adjectiveSentiment !== 0) {
          score += adjectiveSentiment;
          totalWords += 1;
        }
      }
    });
    
    const normalizedScore = totalWords > 0 ? score / totalWords : 0;
    
    return {
      text: sentence,
      sentiment: normalizedScore > 0.15 ? "positive" : normalizedScore < -0.08 ? "negative" : "neutral" // Modificate le soglie
    };
  });
  
  const totalSentences = sentimentResults.length || 1;
  const overallSentiment = {
    positive: sentimentResults.filter(s => s.sentiment === "positive").length / totalSentences,
    negative: sentimentResults.filter(s => s.sentiment === "negative").length / totalSentences,
    neutral: sentimentResults.filter(s => s.sentiment === "neutral").length / totalSentences,
  };

  return {
    basicStats: {
      characters: text.length,
      sentences: sentences.length,
      words: words.length,
      adjectives: adjectivesCount,
    },
    keywords: getNGrams(cleanWords, 1),
    bigrams: getNGrams(cleanWords, 2),
    trigrams: getNGrams(cleanWords, 3),
    adjectives: Object.entries(adjectivesFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40),
    properNouns: findProperNouns(text),
    sentiment: {
      overall: overallSentiment,
      sentences: sentimentResults,
    },
  };
};

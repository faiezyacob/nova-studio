import {
  PromptCategoryKey,
  PromptState,
  RelationshipRule,
} from "@/types/prompt-composer";

export function loadRulesFromData(rules: RelationshipRule[]): RelationshipRule[] {
  return rules;
}

export function getAllowedValues(
  category: PromptCategoryKey,
  currentState: PromptState,
  allValues: string[],
  rules: RelationshipRule[]
): string[] {
  if (rules.length === 0) return allValues;

  const allowed = new Set<string>();
  const forbidden = new Set<string>();
  let hasRelevantRule = false;

  for (const rule of rules) {
    const conditionKey = rule.when.category;
    const conditionValues = currentState[conditionKey]?.value || [];
    const matches = conditionValues.some(v => rule.when.values.includes(v));

    const target = matches ? rule.then : rule.otherwise;
    const targetValues = target[category];

    if (targetValues) {
      hasRelevantRule = true;
      if (matches) {
        targetValues.forEach(v => allowed.add(v));
      } else {
        targetValues.forEach(v => forbidden.add(v));
      }
    }
  }

  if (!hasRelevantRule) return allValues;
  if (allowed.size > 0) return allValues.filter(v => allowed.has(v));
  return allValues.filter(v => !forbidden.has(v));
}

export function validateState(
  state: PromptState,
  rules: RelationshipRule[]
): PromptCategoryKey[] {
  const violations: PromptCategoryKey[] = [];

  for (const rule of rules) {
    const conditionKey = rule.when.category;
    const conditionValues = state[conditionKey]?.value || [];
    const matches = conditionValues.some(v => rule.when.values.includes(v));

    const target = matches ? rule.then : rule.otherwise;

    for (const [category, allowedValues] of Object.entries(target)) {
      const cat = category as PromptCategoryKey;
      const currentValues = state[cat]?.value || [];
      for (const val of currentValues) {
        if (!allowedValues.includes(val)) {
          violations.push(cat);
        }
      }
    }
  }

  return [...new Set(violations)];
}

export function getForbiddenValues(
  category: PromptCategoryKey,
  currentState: PromptState,
  rules: RelationshipRule[]
): string[] {
  const forbidden = new Set<string>();

  for (const rule of rules) {
    const conditionKey = rule.when.category;
    const conditionValues = currentState[conditionKey]?.value || [];
    const matches = conditionValues.some(v => rule.when.values.includes(v));

    const target = matches ? rule.then : rule.otherwise;
    const forbiddenList = target[category];

    if (forbiddenList) {
      forbiddenList.forEach(v => forbidden.add(v));
    }
  }

  return [...forbidden];
}

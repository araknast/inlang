import { expectType } from "tsd"
import { LintRule, createLintRule, LintRuleInitializer, LintRuleId, NodeVisitors } from "./rule.js"
import type { LintLevel } from "./alternative/types.js"

// parameters -----------------------------------------------------------------

expectType<Parameters<typeof createLintRule>[0]>("lint.id")
// @ts-expect-error first parameter must be a LintId
expectType<Parameters<typeof createLintRule>[0]>("id")

expectType<Parameters<typeof createLintRule>[1]>("warn")
expectType<Parameters<typeof createLintRule>[1]>("error")
// @ts-expect-error second parameter must be the LintLevel
expectType<Parameters<typeof createLintRule>[1]>("something")

expectType<Parameters<typeof createLintRule>[2]>(() => ({
	setup: () => undefined,
	visitors: {},
}))
// @ts-expect-error third parameter must return the visitors object
expectType<Parameters<typeof createLintRule>[2]>(() => ({
	setup: () => undefined,
}))

// rule -----------------------------------------------------------------------

const rule = createLintRule("a.b", "error", () => ({
	setup: () => undefined,
	visitors: {},
}))

expectType<Parameters<LintRuleInitializer>[0]>(false)
expectType<Parameters<LintRuleInitializer>[0]>("error")
expectType<Parameters<LintRuleInitializer>[0]>("warn")
// @ts-expect-error 'off' is not a valid LintLevel
expectType<Parameters<LintRuleInitializer>[0]>("off")

expectType<Parameters<LintRuleInitializer>[1]>(undefined)
// @ts-expect-error rule does not expect any settings
expectType<Parameters<LintRuleInitializer>[1]>({ debug: true })

expectType<Parameters<LintRuleInitializer<true>>[1]>(undefined)
expectType<Parameters<LintRuleInitializer<true>>[1]>(true)
// @ts-expect-error rule expect true as settings
expectType<Parameters<LintRuleInitializer<true>>[1]>(false)

expectType<Parameters<LintRuleInitializer<{ debug: true }>>[1]>({
	debug: true,
})
// @ts-expect-error rule expect object as settings
expectType<Parameters<LintRuleInitializer<{ debug: true }>>[1]>(true)
// @ts-expect-error rule expect object with debug property as settings
expectType<Parameters<LintRuleInitializer<{ debug: true }>>[1]>({})

rule("error")
rule("warn")
rule("error")

// ----------------------------------------------------------------------------

const ruleWithOptionalSettings = createLintRule<{ test: boolean }>("a.b", "error", () => ({
	setup: () => undefined,
	visitors: {},
}))

ruleWithOptionalSettings()
ruleWithOptionalSettings("error")
ruleWithOptionalSettings("error", { test: true })
ruleWithOptionalSettings("warn")
ruleWithOptionalSettings("warn", { test: true })
ruleWithOptionalSettings("default")

// ----------------------------------------------------------------------------

const ruleWithRequiredSettings = createLintRule<{ test: boolean }>("a.b", "error", () => ({
	visitors: {},
}))

// @ts-expect-error requires settings to be passed
ruleWithRequiredSettings()
// @ts-expect-error requires settings to be passed
ruleWithRequiredSettings("warn")
// @ts-expect-error requires correct settings object to be passed
ruleWithRequiredSettings("default", { test: true })

// configured rule ------------------------------------------------------------

const configuredRule = rule("error")

expectType<LintRule>(configuredRule)

expectType<LintRuleId>(configuredRule.id)
expectType<LintLevel | "default">(configuredRule.level)
expectType<NodeVisitors>(configuredRule.visitors)

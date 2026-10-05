"""AI recipes: describe a meal, get a recipe saved and planned straight away."""
from __future__ import annotations

import asyncio

import pytest

from app.domain import DomainError
from app.models import HouseholdSnapshot
from app.recipe_ai import RecipeRequest, accept, cookbook_recipe, ingredient_line, write_recipe
from conftest import bearer, child_session, edit, household, pair_tv, parent_token


class FakeWriter:
    name = "bedrock"

    def __init__(self, reply=None, error: Exception | None = None) -> None:
        self.reply, self.error, self.calls = reply, error, []

    async def write(self, description, category, servings):
        self.calls.append((description, category, servings))
        if self.error:
            raise self.error
        return self.reply


MODEL_REPLY = {
    "title": "Crispy lemon chicken tenders", "summary": "Oven-crisp tenders kids love.", "servings": 4, "minutes": 30,
    "ingredients": [{"name": "chicken tenders", "quantity": "1 1/2", "unit": "lb"},
                    {"name": "panko breadcrumbs", "quantity": 1, "unit": "cup"},
                    {"name": "lemon", "quantity": 1, "unit": None}, "salt"],
    "instructions": ["1. Heat the oven to 425°F.", "Step 2: Coat the chicken in panko.", "Bake 18 minutes."],
}


def tiny_household() -> HouseholdSnapshot:
    from app.demo import create_demo_household
    return create_demo_household()


def test_model_reply_is_cleaned_into_a_recipe():
    recipe = accept(MODEL_REPLY, "bedrock", 4)
    assert recipe.title == "Crispy lemon chicken tenders"
    assert recipe.ingredients[0].quantity == 1.5 and recipe.ingredients[0].unit == "lb"
    assert recipe.ingredients[3].name == "salt" and recipe.ingredients[3].quantity is None
    assert recipe.instructions == ["Heat the oven to 425°F.", "Coat the chicken in panko.", "Bake 18 minutes."]
    assert ingredient_line(recipe.ingredients[0]) == "1.5 lb chicken tenders"


def test_bad_or_non_food_replies_are_refused_or_fall_back():
    with pytest.raises(ValueError):
        accept({"title": "x", "ingredients": [], "instructions": []}, "bedrock", 4)
    with pytest.raises(DomainError) as refused:
        accept({"notFood": True}, "bedrock", 4)
    assert refused.value.code == "NOT_A_RECIPE"
    # A broken model reply falls back to the built-in cookbook instead of failing the family.
    broken = FakeWriter(reply={"title": "only a title"})
    recipe = asyncio.run(write_recipe(RecipeRequest(description="quick chicken stir fry"), tiny_household(), broken))
    assert recipe.provider == "cookbook" and recipe.title == "Teriyaki chicken rice bowls"


def test_writer_gets_household_servings_and_budget_is_respected():
    writer = FakeWriter(reply=MODEL_REPLY)
    recipe = asyncio.run(write_recipe(RecipeRequest(description="  chicken   the kids will eat "), tiny_household(), writer))
    assert recipe.provider == "bedrock"
    assert writer.calls == [("chicken the kids will eat", "Dinner", 4)]
    skipped = FakeWriter(reply=MODEL_REPLY)
    over_budget = asyncio.run(write_recipe(RecipeRequest(description="salmon"), tiny_household(), skipped, lambda: False))
    assert skipped.calls == [] and over_budget.provider == "cookbook" and "salmon" in over_budget.title.lower()


def test_cookbook_honours_a_time_limit():
    assert cookbook_recipe("vegetarian dinner", 4)["title"] == "Black bean quesadillas"
    assert cookbook_recipe("chicken dinner in 20 minutes", 4)["minutes"] <= 20


def test_an_unlocked_tv_adds_a_recipes_ingredients_to_groceries(api):
    parent = parent_token(api)
    tv = pair_tv(api, parent)
    meal = api.client.post("/v1/recipes/generate", headers=bearer(tv), json={
        "description": "easy taco night the kids will love", "date": "2026-09-24"}).json()["data"]["meal"]
    locked = edit(api, tv, "mealGroceries", {"id": meal["id"]})
    assert locked.status_code == 403 and locked.json()["error"]["code"] == "PARENT_CODE_REQUIRED"
    assert api.client.post("/v1/access-code", json={"code": "2468"}, headers=bearer(parent)).status_code == 200
    assert api.client.post("/v1/tv/parent-mode", json={"code": "2468"}, headers=bearer(tv)).status_code == 200
    added = edit(api, tv, "mealGroceries", {"id": meal["id"]})
    assert added.status_code == 200, added.text
    groceries = {item["title"] for item in added.json()["data"]["listItems"] if item["listName"] == "Groceries"}
    assert {"ground turkey", "corn tortillas"} <= groceries


def test_bare_fractions_in_a_model_reply_still_parse():
    from app.recipe_ai import parse_model_json

    # Nova Lite's real reply for "vegetarian pasta with spinach": 1/2 and 1 1/2 aren't valid JSON numbers.
    raw = ('{"title": "Vegetarian Spinach Pasta", "summary": "Quick pasta.", "servings": 4, "minutes": 25, '
           '"ingredients": [{"name": "Pasta", "quantity": 12, "unit": "ounces"}, '
           '{"name": "Parmesan cheese", "quantity": 1/2, "unit": "cup"}, '
           '{"name": "Milk", "quantity": 1 1/2, "unit": "cups"}, {"name": "Salt", "quantity": null, "unit": null}], '
           '"instructions": ["Boil the pasta.", "Wilt the spinach.", "Toss with cheese."]}')
    recipe = accept(parse_model_json(raw), "bedrock", 4)
    assert recipe.provider == "bedrock" and recipe.title == "Vegetarian Spinach Pasta"
    quantities = {item.name.lower(): item.quantity for item in recipe.ingredients}
    assert quantities["parmesan cheese"] == 0.5 and quantities["milk"] == 1.5 and quantities["salt"] is None


def test_a_broken_aws_setup_falls_back_to_the_cookbook(monkeypatch):
    import app.recipe_ai as recipe_ai

    def broken(*args, **kwargs):
        raise RuntimeError("The config profile could not be found")

    monkeypatch.setattr(recipe_ai, "bedrock_enabled", lambda: True, raising=False)
    monkeypatch.setattr("app.voice.bedrock_enabled", lambda: True)
    monkeypatch.setattr(recipe_ai, "BedrockRecipeWriter", broken)
    assert recipe_ai.configured_recipe_writer() is None
    recipe = asyncio.run(write_recipe(RecipeRequest(description="vegetarian dinner"), tiny_household(), None))
    assert recipe.provider == "cookbook"


def test_parent_generates_a_recipe_that_is_saved_and_planned_without_review(api):
    parent = parent_token(api)
    before = household(api, parent)
    reply = api.client.post("/v1/recipes/generate", headers=bearer(parent), json={
        "description": "easy taco night the kids will love", "date": "2026-09-24", "groceries": True})
    assert reply.status_code == 200, reply.text
    data = reply.json()["data"]
    assert data["provider"] == "cookbook"  # No Bedrock in tests.
    recipe, meal, home = data["recipe"], data["meal"], data["household"]
    assert recipe["name"] == "Weeknight turkey tacos" and recipe["source"].startswith("Hometide AI: easy taco night")
    assert meal["date"] == "2026-09-24" and meal["recipeId"] == recipe["id"] and meal["minutes"] == 20
    assert "1 lb ground turkey" in meal["ingredients"] and len(meal["instructions"]) == 5
    assert home["revision"] == before["revision"] + 1
    groceries = [item for item in home["listItems"] if item["listName"] == "Groceries"]
    assert {"ground turkey", "corn tortillas"} <= {item["title"] for item in groceries}
    assert home["auditLog"][-1]["action"] == "recipeGenerated"


def test_generating_for_a_planned_day_replaces_that_meal_and_keeps_its_slot(api):
    parent = parent_token(api)
    planned = {"id": "dinner-thu", "title": "Leftovers", "date": "2026-09-24", "category": "Dinner", "cookIds": ["alex"],
               "servings": 4, "minutes": 10, "ingredients": [], "instructions": []}
    assert edit(api, parent, "meal", planned).status_code == 200
    data = api.client.post("/v1/recipes/generate", headers=bearer(parent), json={
        "description": "honey garlic salmon", "date": "2026-09-24"}).json()["data"]
    dinners = [item for item in data["household"]["meals"] if item["date"] == "2026-09-24" and item["category"] == "Dinner"]
    assert len(dinners) == 1
    assert dinners[0]["id"] == "dinner-thu" and dinners[0]["cookIds"] == ["alex"]
    assert dinners[0]["title"] == "Honey garlic salmon"
    # Without a date the recipe is only saved to the family's recipes.
    only = api.client.post("/v1/recipes/generate", headers=bearer(parent), json={"description": "pizza night"}).json()["data"]
    assert only["meal"] is None and any(item["id"] == only["recipe"]["id"] for item in only["household"]["recipes"])


def test_a_paired_tv_may_generate_but_a_child_or_stranger_may_not(api):
    parent = parent_token(api)
    tv = pair_tv(api, parent)
    reply = api.client.post("/v1/recipes/generate", headers=bearer(tv), json={"description": "breakfast for dinner",
                                                                              "date": "2026-09-23"})
    assert reply.status_code == 200, reply.text
    assert reply.json()["data"]["meal"]["title"] == "Breakfast-for-dinner scramble"
    assert api.client.post("/v1/access-code", json={"code": "2468"}, headers=bearer(parent)).status_code == 200
    child = child_session(api, "emma")
    assert api.client.post("/v1/recipes/generate", headers=bearer(child),
                           json={"description": "cake"}).json()["error"]["code"] == "CHILD_PERMISSION_DENIED"
    assert api.client.post("/v1/recipes/generate", json={"description": "cake"}).status_code == 401
    # The write itself stays server-only: nobody can post a "generated" recipe directly.
    direct = edit(api, parent, "recipeGenerated", {"id": "ai-x", "recipe": {"id": "ai-x", "name": "Fake"}, "meal": None})
    assert direct.json()["error"]["code"] == "CONFIRMATION_REQUIRED"


def test_description_limits_are_validated(api):
    parent = parent_token(api)
    for body in ({"description": "no"}, {"description": "x" * 301}, {"description": "soup", "date": "Tuesday"}):
        assert api.client.post("/v1/recipes/generate", headers=bearer(parent), json=body).status_code == 422

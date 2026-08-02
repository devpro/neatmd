# Example

`CommonDtoMappings.ToRequiredString` (`WebApi/Mappers/`, a `[UserMapping]` static method attached to the affected DTO mappers via `[UseStaticMapper(typeof(CommonDtoMappings))]`) reproduces AutoMapper's old `?? string.Empty` behavior.
It applies for every such string member across every mapper that needs it.
This is for exact behavior parity.

`VideoGamePlatformModel.ProductName` (free text) is the store's own specific product/edition text for that copy (e.g. "Grand Theft Auto V : Édition Premium"), distinct from the game's own `Title` -
added for the generic video game transaction import below, but it's a plain field on the shared model/entity/DTO, editable on `VideoGameDetail.razor` like any other copy detail regardless of how the platform entry was created.
It renders via a new `ExtraFields` render-fragment slot on the shared `OwnedVersionFields` component (`Components/Inventory/Shared/`), not by adding it to `IOwnedCopyDto`:
Movie/TvShow/Book/Album's `OwnedVersionDto` has no equivalent concept, so the interface every `OwnedVersionFields` caller shares stays free of a field only one of them needs.
The component's own Price/Acquired/Vendor/Reference columns switched from a fixed `col-md-3` to an unnumbered `col-md` (Bootstrap's equal-width auto layout) for this -
with no `ExtraFields` supplied they still fill one row identically to the old fixed split, but a 5th `ExtraFields` column (VideoGame's Product field) joins the same row and every column re-shares the width automatically instead of wrapping
to a second row on desktop, while `col-6` still stacks two-per-row on mobile like the others.
